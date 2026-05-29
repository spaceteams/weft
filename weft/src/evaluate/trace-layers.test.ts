import { describe, expect, it } from "vitest";
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

const unitsLayer: LayerEvaluator<string> = {
  name: "units",
  version: "1",
  eval(op, deps) {
    const values = [...deps.values()];
    if (op === "sum") return values[0]; // inherit unit from first dep
    if (op === "ratio") return `(${values[0]})/(${values[1]})`;
    return values[0];
  },
};

describe("TraceStep layer data", () => {
  it("layerOutputs contains computed layer values", () => {
    const a = key<number>("a");
    const b = key<number>("b");

    const m = createModel();
    m.input(a);
    m.layer(unitsLayer);
    m.annotate(a, "units", "kg");

    m.rule(
      rule({
        target: b,
        deps: [a],
        spec: { op: "sum" },
        eval: (get) => ({ output: get(a) }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { a: 10 });

    const step = result.trace.find((s) => s.target === "b");
    expect(step).toBeDefined();
    expect(step!.layerOutputs).toEqual({ units: "kg" });
  });

  it("layerInputs contains dependency layer values", () => {
    const x = key<number>("x");
    const y = key<number>("y");
    const z = key<number>("z");

    const m = createModel();
    m.input(x);
    m.input(y);
    m.layer(unitsLayer);
    m.annotate(x, "units", "m");
    m.annotate(y, "units", "s");

    m.rule(
      rule({
        target: z,
        deps: [x, y],
        spec: { op: "ratio" },
        eval: (get) => ({ output: get(x) / get(y) }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { x: 100, y: 2 });

    const step = result.trace.find((s) => s.target === "z");
    expect(step).toBeDefined();
    expect(step!.layerInputs).toEqual({ units: { x: "m", y: "s" } });
    expect(step!.layerOutputs).toEqual({ units: "(m)/(s)" });
  });

  it("layerInputs and layerOutputs are absent when no layers are registered", () => {
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
    const result = evaluate(compiled, { a: 5 });

    const step = result.trace.find((s) => s.target === "b");
    expect(step).toBeDefined();
    expect(step!.layerInputs).toBeUndefined();
    expect(step!.layerOutputs).toBeUndefined();
  });

  it("layerInputs absent when deps have no layer values (sparse)", () => {
    const a = key<number>("a");
    const b = key<number>("b");

    const sparseLayer: LayerEvaluator<string> = {
      name: "sparse",
      version: "1",
      eval(_op, deps) {
        if (deps.size > 0) return "propagated";
        return undefined;
      },
      // no default — truly sparse
    };

    const m = createModel();
    m.input(a);
    m.layer(sparseLayer);
    // no annotation for "a"

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

    const step = result.trace.find((s) => s.target === "b");
    expect(step).toBeDefined();
    // No dep has a layer value, so layerInputs should be absent
    expect(step!.layerInputs).toBeUndefined();
    // eval returns undefined when deps is empty, and no default → absent
    expect(step!.layerOutputs).toBeUndefined();
  });

  it("layerOutputs absent when layer eval returns undefined (sparse)", () => {
    const a = key<number>("a");
    const b = key<number>("b");

    const noopLayer: LayerEvaluator<string> = {
      name: "noop",
      version: "1",
      eval() {
        return undefined;
      },
      // no default
    };

    const m = createModel();
    m.input(a);
    m.layer(noopLayer);
    m.annotate(a, "noop", "present");

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

    const step = result.trace.find((s) => s.target === "b");
    expect(step).toBeDefined();
    // Dep "a" has a layer value, so layerInputs should be present
    expect(step!.layerInputs).toEqual({ noop: { a: "present" } });
    // eval returns undefined and no default → layerOutputs absent
    expect(step!.layerOutputs).toBeUndefined();
  });

  it("multiple layers appear in layerInputs and layerOutputs", () => {
    const a = key<number>("a");
    const b = key<number>("b");

    const provenanceLayer: LayerEvaluator<string> = {
      name: "provenance",
      version: "1",
      eval() {
        return "computed";
      },
    };

    const m = createModel();
    m.input(a);
    m.layer(unitsLayer);
    m.layer(provenanceLayer);
    m.annotate(a, "units", "EUR");
    m.annotate(a, "provenance", "user-input");

    m.rule(
      rule({
        target: b,
        deps: [a],
        spec: { op: "sum" },
        eval: (get) => ({ output: get(a) * 2 }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { a: 50 });

    const step = result.trace.find((s) => s.target === "b");
    expect(step).toBeDefined();

    // Both layers provide dep values
    expect(step!.layerInputs).toEqual({
      units: { a: "EUR" },
      provenance: { a: "user-input" },
    });

    // Both layers compute an output
    expect(step!.layerOutputs).toEqual({
      units: "EUR",
      provenance: "computed",
    });
  });

  it("chain of rules propagates layer values through trace steps", () => {
    const c = key<number>("c"); // input
    const b = key<number>("b"); // rule B depends on C
    const a = key<number>("a"); // rule A depends on B

    const m = createModel();
    m.input(c);
    m.layer(unitsLayer);
    m.annotate(c, "units", "kg");

    m.rule(
      rule({
        target: b,
        deps: [c],
        spec: { op: "sum" },
        eval: (get) => ({ output: get(c) + 1 }),
      }),
    );

    m.rule(
      rule({
        target: a,
        deps: [b],
        spec: { op: "sum" },
        eval: (get) => ({ output: get(b) * 3 }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { c: 10 });

    // Step for B: depends on input C which has "kg"
    const stepB = result.trace.find((s) => s.target === "b");
    expect(stepB).toBeDefined();
    expect(stepB!.layerInputs).toEqual({ units: { c: "kg" } });
    expect(stepB!.layerOutputs).toEqual({ units: "kg" });

    // Step for A: depends on rule B which now has layer value "kg"
    const stepA = result.trace.find((s) => s.target === "a");
    expect(stepA).toBeDefined();
    expect(stepA!.layerInputs).toEqual({ units: { b: "kg" } });
    expect(stepA!.layerOutputs).toEqual({ units: "kg" });

    // Verify the actual computed values are correct too
    expect(result.values.get("b")).toBe(11);
    expect(result.values.get("a")).toBe(33);
  });
});
