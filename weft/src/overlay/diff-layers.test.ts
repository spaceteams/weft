import { describe, expect, it } from "vitest";
import { evaluate } from "../evaluate";
import type { KeyId } from "../key";
import { key } from "../key";
import type { LayerEvaluator } from "../layer";
import { compileModel } from "../model/compile-model";
import { createModel } from "../model/create-model";
import { rule } from "../rule";
import { diffResults } from "./diff-results";

function compileOrFail(model: ReturnType<ReturnType<typeof createModel>["build"]>) {
  const result = compileModel(model);
  if (!result.ok) throw new Error(`Compile failed: ${result.issues.map((i) => i.message)}`);
  return result.model;
}

describe("diffResults — layer deltas", () => {
  const confidenceLayer: LayerEvaluator<number> = {
    name: "confidence",
    version: "1",
    eval(_op, deps) {
      const values = [...deps.values()];
      return values.length > 0 ? Math.min(...values) * 0.9 : undefined;
    },
  };

  it("returns layerDeltas when layer values change between evaluations", () => {
    const a = key<number>("a");
    const b = key<number>("b");

    const m = createModel();
    m.input(a);
    m.layer(confidenceLayer);
    m.annotate(a, "confidence", 1.0);
    m.rule(
      rule({
        target: b,
        deps: [a],
        spec: { op: "scale", factor: 2 },
        eval: (get) => ({ output: get(a) * 2 }),
      }),
    );

    const compiled = compileOrFail(m.build());
    // Before: input missing (lenient) → rule b doesn't run → no layer value for b
    const before = evaluate(compiled, {}, "lenient");
    // After: input provided → rule b runs → layer value for b appears
    const after = evaluate(compiled, { a: 10 });

    const { deltas, layerDeltas } = diffResults(compiled, before, after);

    // Main value deltas are present
    expect(deltas).toEqual(
      expect.arrayContaining([
        { key: "a", kind: "added", after: 10 },
        { key: "b", kind: "added", after: 20 },
      ]),
    );
    // Layer deltas are also present
    expect(layerDeltas).toBeDefined();
    expect(layerDeltas!.confidence).toEqual([
      { key: "b", kind: "added", after: expect.closeTo(0.9) },
    ]);
  });

  it("returns undefined layerDeltas when no layers are registered", () => {
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
    const before = evaluate(compiled, { a: 1 });
    const after = evaluate(compiled, { a: 2 });

    const { layerDeltas } = diffResults(compiled, before, after);

    expect(layerDeltas).toBeUndefined();
  });

  it("returns undefined layerDeltas when layer values do not change", () => {
    const a = key<number>("a");
    const b = key<number>("b");

    const m = createModel();
    m.input(a);
    m.layer(confidenceLayer);
    m.annotate(a, "confidence", 1.0);
    m.rule(
      rule({
        target: b,
        deps: [a],
        spec: { op: "scale", factor: 2 },
        eval: (get) => ({ output: get(a) * 2 }),
      }),
    );

    const compiled = compileOrFail(m.build());
    // Different input values but same layer annotations → same layer values
    const before = evaluate(compiled, { a: 5 });
    const after = evaluate(compiled, { a: 10 });

    const { deltas, layerDeltas } = diffResults(compiled, before, after);

    // Main values did change
    expect(deltas).toEqual(
      expect.arrayContaining([
        { key: "a", kind: "changed", before: 5, after: 10 },
        { key: "b", kind: "changed", before: 10, after: 20 },
      ]),
    );
    // But layer values did not — annotations are fixed on the model
    expect(layerDeltas).toBeUndefined();
  });

  it("detects changed layer values when annotations differ", () => {
    const a = key<number>("a");
    const b = key<number>("b");

    // Simulate an annotation change by building two models with different
    // confidence values. diffResults only uses getDeclaredKeys + semantics
    // from the model argument, so passing either compiled model works as
    // long as both declare the same keys.
    function buildWithConfidence(confidence: number) {
      const m = createModel();
      m.input(a);
      m.layer(confidenceLayer);
      m.annotate(a, "confidence", confidence);
      m.rule(
        rule({
          target: b,
          deps: [a],
          spec: { op: "scale", factor: 2 },
          eval: (get) => ({ output: get(a) * 2 }),
        }),
      );
      return compileOrFail(m.build());
    }

    const modelHigh = buildWithConfidence(1.0);
    const modelLow = buildWithConfidence(0.5);

    const before = evaluate(modelHigh, { a: 10 });
    const after = evaluate(modelLow, { a: 10 });

    const { layerDeltas } = diffResults(modelHigh, before, after);

    expect(layerDeltas).toBeDefined();
    expect(layerDeltas!.confidence).toEqual(
      expect.arrayContaining([
        { key: "a", kind: "changed", before: 1.0, after: 0.5 },
        {
          key: "b",
          kind: "changed",
          before: expect.closeTo(0.9),
          after: expect.closeTo(0.45),
        },
      ]),
    );
  });

  it("detects added layer values", () => {
    const a = key<number>("a");
    const b = key<number>("b");

    const m = createModel();
    m.input(a);
    m.layer(confidenceLayer);
    m.annotate(a, "confidence", 1.0);
    m.rule(
      rule({
        target: b,
        deps: [a],
        spec: { op: "scale", factor: 2 },
        eval: (get) => ({ output: get(a) * 2 }),
      }),
    );

    const compiled = compileOrFail(m.build());
    // Before: a missing → b rule doesn't run → no layer value for b
    const before = evaluate(compiled, {}, "lenient");
    // After: a provided → b runs → layer value for b appears
    const after = evaluate(compiled, { a: 10 });

    const { layerDeltas } = diffResults(compiled, before, after);

    expect(layerDeltas).toBeDefined();
    // Input annotation for a is seeded in both evaluations (unchanged),
    // so only the computed key b produces an "added" delta.
    expect(layerDeltas!.confidence).toEqual([
      { key: "b", kind: "added", after: expect.closeTo(0.9) },
    ]);
  });

  it("detects removed layer values", () => {
    const a = key<number>("a");
    const b = key<number>("b");

    const m = createModel();
    m.input(a);
    m.layer(confidenceLayer);
    m.annotate(a, "confidence", 1.0);
    m.rule(
      rule({
        target: b,
        deps: [a],
        spec: { op: "scale", factor: 2 },
        eval: (get) => ({ output: get(a) * 2 }),
      }),
    );

    const compiled = compileOrFail(m.build());
    // Before: a provided → b runs → layer value for b exists
    const before = evaluate(compiled, { a: 10 });
    // After: a missing (lenient) → b doesn't run → layer value for b gone
    const after = evaluate(compiled, {}, "lenient");

    const { layerDeltas } = diffResults(compiled, before, after);

    expect(layerDeltas).toBeDefined();
    expect(layerDeltas!.confidence).toEqual([
      { key: "b", kind: "removed", before: expect.closeTo(0.9) },
    ]);
  });

  it("produces separate entries in layerDeltas for multiple layers", () => {
    const x = key<number>("x");
    const y = key<number>("y");

    const sourceLayer: LayerEvaluator<string> = {
      name: "source",
      version: "1",
      eval() {
        return "computed";
      },
    };

    const m = createModel();
    m.input(x);
    m.layer(confidenceLayer);
    m.layer(sourceLayer);
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
    const before = evaluate(compiled, {}, "lenient");
    const after = evaluate(compiled, { x: 5 });

    const { layerDeltas } = diffResults(compiled, before, after);

    expect(layerDeltas).toBeDefined();
    // Each layer has its own entry
    expect(layerDeltas!.confidence).toEqual([
      { key: "y", kind: "added", after: expect.closeTo(0.9) },
    ]);
    expect(layerDeltas!.source).toEqual([{ key: "y", kind: "added", after: "computed" }]);
  });

  it("uses deep comparison for object-valued layer deltas", () => {
    const distance = key<number>("distance");
    const time = key<number>("time");
    const speed = key<number>("speed");

    type Unit = { num: string[]; denom: string[] };

    const unitsLayer: LayerEvaluator<Unit> = {
      name: "units",
      version: "1",
      eval(op, deps, spec) {
        if (op !== "ratio") return undefined;
        const numUnit = deps.get(spec.numerator as KeyId);
        const denomKey =
          typeof spec.denominator === "string"
            ? (spec.denominator as KeyId)
            : ((spec.denominator as { id: KeyId }).id as KeyId);
        const denomUnit = deps.get(denomKey);
        if (!numUnit || !denomUnit) return undefined;
        return { num: numUnit.num, denom: [...numUnit.denom, ...denomUnit.num] };
      },
    };

    function buildModel(distanceUnit: Unit) {
      const m = createModel();
      m.input(distance);
      m.input(time);
      m.layer(unitsLayer);
      m.annotate(distance, "units", distanceUnit);
      m.annotate(time, "units", { num: ["s"], denom: [] });
      m.rule(
        rule({
          target: speed,
          deps: [distance, time],
          spec: {
            op: "ratio",
            numerator: "distance",
            denominator: { __kind: "key", id: "time" },
          },
          eval: (get) => ({ output: get(distance) / get(time) }),
        }),
      );
      return compileOrFail(m.build());
    }

    // Structurally equal objects → no delta (deep comparison detects equality)
    const modelA = buildModel({ num: ["m"], denom: [] });
    const resultA1 = evaluate(modelA, { distance: 100, time: 2 });
    const resultA2 = evaluate(modelA, { distance: 200, time: 2 });
    expect(diffResults(modelA, resultA1, resultA2).layerDeltas).toBeUndefined();

    // Different unit objects → changed delta detected
    const modelB = buildModel({ num: ["km"], denom: [] });
    const resultB = evaluate(modelB, { distance: 100, time: 2 });

    const { layerDeltas } = diffResults(modelA, resultA1, resultB);
    expect(layerDeltas).toBeDefined();
    expect(layerDeltas!.units).toEqual(
      expect.arrayContaining([
        {
          key: "distance",
          kind: "changed",
          before: { num: ["m"], denom: [] },
          after: { num: ["km"], denom: [] },
        },
        {
          key: "speed",
          kind: "changed",
          before: { num: ["m"], denom: ["s"] },
          after: { num: ["km"], denom: ["s"] },
        },
      ]),
    );
  });
});
