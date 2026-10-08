import { describe, expect, it } from "vitest";
import type { KeyId } from "../key";
import { key } from "../key";
import type { LayerEvaluator } from "../layer";
import { compileModel } from "../model/compile-model";
import { createModel } from "../model/create-model";
import { rule } from "../rule";
import { evaluate } from ".";

function compileOrFail(model: ReturnType<ReturnType<typeof createModel>["build"]>) {
  const result = compileModel(model);
  if (!result.ok) throw new Error(`Compile failed: ${result.issues.map((i) => i.message)}`);
  return result.model;
}

describe("layer evaluation", () => {
  it("propagates layer values through the computation graph", () => {
    const distance = key<number>("distance");
    const time = key<number>("time");
    const speed = key<number>("speed");

    type Unit = { num: string[]; denom: string[] };

    const unitsLayer: LayerEvaluator<Unit> = {
      name: "units",
      version: "1",
      eval(op, deps, spec) {
        switch (op) {
          case "ratio": {
            const numUnit = deps.get(spec.numerator as KeyId);
            const denomKey =
              typeof spec.denominator === "string"
                ? (spec.denominator as KeyId)
                : ((spec.denominator as { id: KeyId }).id as KeyId);
            const denomUnit = deps.get(denomKey);
            if (!numUnit || !denomUnit) return undefined;
            return { num: numUnit.num, denom: [...numUnit.denom, ...denomUnit.num] };
          }
          default:
            return undefined;
        }
      },
    };

    const m = createModel();
    m.input(distance);
    m.input(time);
    m.layer(unitsLayer);
    m.annotate(distance, "units", { num: ["m"], denom: [] });
    m.annotate(time, "units", { num: ["s"], denom: [] });

    m.rule(
      rule({
        target: speed,
        deps: [distance, time],
        spec: { op: "ratio", numerator: "distance", denominator: { __kind: "key", id: "time" } },
        eval: (get) => ({ output: get(distance) / get(time) }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { distance: 100, time: 2 });

    expect(result.values.get("speed")).toBe(50);
    expect(result.layers.get("units")?.get("distance")).toEqual({ num: ["m"], denom: [] });
    expect(result.layers.get("units")?.get("time")).toEqual({ num: ["s"], denom: [] });
    expect(result.layers.get("units")?.get("speed")).toEqual({ num: ["m"], denom: ["s"] });
  });

  it("uses default fallback when eval returns undefined", () => {
    const a = key<number>("a");
    const b = key<number>("b");

    const provenanceLayer: LayerEvaluator<string> = {
      name: "provenance",
      version: "1",
      eval() {
        return undefined;
      },
      default: () => "derived",
    };

    const m = createModel();
    m.input(a);
    m.layer(provenanceLayer);
    m.annotate(a, "provenance", "user-input");

    m.rule(
      rule({
        target: b,
        deps: [a],
        spec: { op: "identity" },
        eval: (get) => ({ output: get(a) }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { a: 42 });

    expect(result.layers.get("provenance")?.get("a")).toBe("user-input");
    expect(result.layers.get("provenance")?.get("b")).toBe("derived");
  });

  it("is sparse — keys without layer values are absent from the map", () => {
    const a = key<number>("a");
    const b = key<number>("b");

    const sparseLayer: LayerEvaluator<string> = {
      name: "sparse",
      version: "1",
      eval() {
        return undefined;
      },
      // no default
    };

    const m = createModel();
    m.input(a);
    m.layer(sparseLayer);
    // no annotation for "a" either

    m.rule(
      rule({
        target: b,
        deps: [a],
        spec: { op: "identity" },
        eval: (get) => ({ output: get(a) }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { a: 1 });

    expect(result.layers.get("sparse")?.get("a")).toBeUndefined();
    expect(result.layers.get("sparse")?.get("b")).toBeUndefined();
    expect(result.layers.get("sparse")?.size).toBe(0);
  });

  it("supports multiple layers simultaneously", () => {
    const x = key<number>("x");
    const y = key<number>("y");

    const layer1: LayerEvaluator<number> = {
      name: "confidence",
      version: "1",
      eval(_op, deps) {
        const values = [...deps.values()];
        return values.length > 0 ? Math.min(...values) * 0.9 : undefined;
      },
    };

    const layer2: LayerEvaluator<string> = {
      name: "source",
      version: "1",
      eval() {
        return "computed";
      },
    };

    const m = createModel();
    m.input(x);
    m.layer(layer1);
    m.layer(layer2);
    m.annotate(x, "confidence", 1.0);
    m.annotate(x, "source", "manual");

    m.rule(
      rule({
        target: y,
        deps: [x],
        spec: { op: "scale", factor: 2 },
        eval: (get) => ({ output: get(x) * 2 }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { x: 5 });

    expect(result.values.get("y")).toBe(10);
    expect(result.layers.get("confidence")?.get("x")).toBe(1.0);
    expect(result.layers.get("confidence")?.get("y")).toBeCloseTo(0.9);
    expect(result.layers.get("source")?.get("x")).toBe("manual");
    expect(result.layers.get("source")?.get("y")).toBe("computed");
  });

  it("works with no layers registered", () => {
    const a = key<number>("a");
    const b = key<number>("b");

    const m = createModel();
    m.input(a);
    m.rule(
      rule({
        target: b,
        deps: [a],
        spec: { op: "identity" },
        eval: (get) => ({ output: get(a) }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { a: 7 });

    expect(result.values.get("b")).toBe(7);
    expect(result.layers.size).toBe(0);
  });

  it("uses spec.type as fallback when spec.op is absent", () => {
    const a = key<number>("a");
    const b = key<number>("b");

    const typeLayer: LayerEvaluator<string> = {
      name: "opTracker",
      version: "1",
      eval(op) {
        return `saw:${op}`;
      },
    };

    const m = createModel();
    m.input(a);
    m.layer(typeLayer);

    m.rule(
      rule({
        target: b,
        deps: [a],
        spec: { type: "identity" },
        eval: (get) => ({ output: get(a) }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { a: 1 });

    expect(result.layers.get("opTracker")?.get("b")).toBe("saw:identity");
  });
});

// ---------------------------------------------------------------------------
// Layer access to the computed output
//
// A layer used to be value-blind: eval(op, deps, spec) had no way to see the
// value its rule produced, so a policy layer could not read the number it was
// annotating. `output` is now threaded through.
// ---------------------------------------------------------------------------

describe("layer access to the computed output", () => {
  it("passes the rule's output to eval", () => {
    const a = key<number>("a");
    const b = key<number>("b");

    const seen: unknown[] = [];
    const outputLayer: LayerEvaluator<string> = {
      name: "outputReader",
      version: "1",
      eval(_op, _deps, _spec, output) {
        seen.push(output);
        return typeof output === "number" && output > 0 ? "positive" : "not-positive";
      },
    };

    const m = createModel();
    m.input(a);
    m.layer(outputLayer);
    m.rule(
      rule({
        target: b,
        deps: [a],
        spec: { op: "identity" },
        eval: (get) => ({ output: get(a) * 10 }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { a: 4 });

    expect(seen).toEqual([40]);
    expect(result.layers.get("outputReader")?.get("b")).toBe("positive");
  });

  it("passes the rule's output to default", () => {
    const a = key<number>("a");
    const b = key<string>("b");

    const fallbackLayer: LayerEvaluator<string> = {
      name: "fallback",
      version: "1",
      eval() {
        return undefined;
      },
      default(_deps, output) {
        return `fallback:${String(output)}`;
      },
    };

    const m = createModel();
    m.input(a);
    m.layer(fallbackLayer);
    m.rule(
      rule({
        target: b,
        deps: [a],
        spec: { op: "unheard-of" },
        eval: (get) => ({ output: `label-${get(a)}` }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { a: 3 });

    expect(result.layers.get("fallback")?.get("b")).toBe("fallback:label-3");
  });

  it("gives the layer the output even when its deps carry no layer values", () => {
    const a = key<number>("a");
    const b = key<number>("b");

    // Deps is empty (nothing is annotated), so this layer can only produce a
    // value by reading `output`.
    const outputOnly: LayerEvaluator<number> = {
      name: "outputOnly",
      version: "1",
      eval(_op, deps, _spec, output) {
        return deps.size === 0 && typeof output === "number" ? output : undefined;
      },
    };

    const m = createModel();
    m.input(a);
    m.layer(outputOnly);
    m.rule(
      rule({
        target: b,
        deps: [a],
        spec: { op: "identity" },
        eval: (get) => ({ output: get(a) + 1 }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { a: 41 });

    expect(result.layers.get("outputOnly")?.get("b")).toBe(42);
  });

  it("hands the layer an unknown output it must narrow", () => {
    const a = key<number>("a");
    const b = key<boolean>("b");

    // Documents the deliberate `unknown`: this layer narrows before use.
    const typeNarrowing: LayerEvaluator<string> = {
      name: "narrowing",
      version: "1",
      eval(_op, _deps, _spec, output) {
        return typeof output === "boolean" ? String(output) : undefined;
      },
    };

    const m = createModel();
    m.input(a);
    m.layer(typeNarrowing);
    m.rule(
      rule({
        target: b,
        deps: [a],
        spec: { op: "compare" },
        eval: (get) => ({ output: get(a) > 0 }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { a: 1 });

    expect(result.layers.get("narrowing")?.get("b")).toBe("true");
  });

  // Guards the claim that adding `output` is source-compatible for layer
  // authors and for direct callers. Type-level only — these declarations exist
  // to be typechecked.
  it("still accepts layers written against the previous signatures", () => {
    const threeParams: LayerEvaluator<string> = {
      name: "three",
      version: "1",
      eval(op, deps, spec) {
        return `${op}:${deps.size}:${Object.keys(spec).length}`;
      },
    };
    const twoParams: LayerEvaluator<string> = {
      name: "two",
      version: "1",
      eval(op) {
        return op;
      },
    };
    const zeroParams: LayerEvaluator<string> = {
      name: "zero",
      version: "1",
      eval() {
        return "constant";
      },
    };
    const legacyDefault: LayerEvaluator<string> = {
      name: "legacyDefault",
      version: "1",
      eval() {
        return undefined;
      },
      default(deps) {
        return `default:${deps.size}`;
      },
    };
    // An implementation may declare `output` as required, optional, or omit it.
    const requiredParam: LayerEvaluator<string> = {
      name: "requiredParam",
      version: "1",
      eval(_op, _deps, _spec, output: unknown) {
        return typeof output;
      },
    };

    expect(
      [threeParams, twoParams, zeroParams, legacyDefault, requiredParam].map((l) => l.name),
    ).toEqual(["three", "two", "zero", "legacyDefault", "requiredParam"]);
  });

  it("allows direct three-argument calls to eval", () => {
    const direct: LayerEvaluator<string> = {
      name: "direct",
      version: "1",
      eval(_op, _deps, _spec, output) {
        return output === undefined ? "absent" : "present";
      },
    };

    const deps = new Map<string, string>();
    expect(direct.eval("op", deps, {})).toBe("absent");
    expect(direct.eval("op", deps, {}, 1)).toBe("present");
  });
});
