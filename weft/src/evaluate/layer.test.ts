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
