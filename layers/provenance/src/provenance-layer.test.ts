import { compileModel, createModel, evaluate, key, rule } from "@spaceteams/weft";
import { describe, expect, it } from "vitest";
import type { Provenance } from "./provenance";
import { derived, provenance, provenanceLayer } from "./provenance";

function compileOrFail(model: ReturnType<ReturnType<typeof createModel>["build"]>) {
  const result = compileModel(model);
  if (!result.ok) throw new Error(`Compile failed: ${result.issues.map((i) => i.message)}`);
  return result.model;
}

describe("provenance helpers", () => {
  it("provenance() creates correct objects with defaults", () => {
    const p = provenance("user-input");
    expect(p).toEqual({ source: "user-input", confidence: 1 });
  });

  it("provenance() creates correct objects with explicit confidence", () => {
    const p = provenance("GPS", 0.9);
    expect(p).toEqual({ source: "GPS", confidence: 0.9 });
  });

  it("provenance() creates correct objects with tags", () => {
    const p = provenance("estimate", 0.7, ["provisional", "audited"]);
    expect(p).toEqual({
      source: "estimate",
      confidence: 0.7,
      tags: ["provisional", "audited"],
    });
  });

  it("provenance() omits tags when empty array is passed", () => {
    const p = provenance("user-input", 1, []);
    expect(p).toEqual({ source: "user-input", confidence: 1 });
    expect(p).not.toHaveProperty("tags");
  });
});

describe("derived()", () => {
  it("returns unknown with confidence 0 when no deps", () => {
    const result = derived(new Map());
    expect(result).toEqual({ source: "unknown", confidence: 0 });
  });

  it("returns min confidence from deps", () => {
    const deps = new Map<string, Provenance>([
      ["a", { source: "GPS", confidence: 0.9 }],
      ["b", { source: "user-input", confidence: 0.5 }],
      ["c", { source: "estimate", confidence: 0.8 }],
    ]);
    const result = derived(deps);
    expect(result).toEqual({ source: "derived", confidence: 0.5 });
  });

  it("returns confidence 1 when all deps have confidence 1", () => {
    const deps = new Map<string, Provenance>([
      ["a", { source: "user-input", confidence: 1 }],
      ["b", { source: "GPS", confidence: 1 }],
    ]);
    const result = derived(deps);
    expect(result).toEqual({ source: "derived", confidence: 1 });
  });
});

describe("provenanceLayer", () => {
  it("produces derived provenance for computed values", () => {
    const a = key<number>("a");
    const b = key<number>("b");

    const m = createModel();
    m.input(a);
    m.layer(provenanceLayer);
    m.annotate(a, "provenance", provenance("user-input", 0.9));

    m.rule(
      rule({
        target: b,
        deps: [a],
        spec: { op: "scale", factor: 2 },
        eval: (get) => ({ output: get(a) * 2 }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { a: 10 });

    const layerMap = result.layers.get("provenance");
    expect(layerMap?.get("a")).toEqual({ source: "user-input", confidence: 0.9 });
    expect(layerMap?.get("b")).toEqual({ source: "derived", confidence: 0.9 });
  });

  it("confidence is minimum of all deps", () => {
    const x = key<number>("x");
    const y = key<number>("y");
    const z = key<number>("z");

    const m = createModel();
    m.input(x);
    m.input(y);
    m.layer(provenanceLayer);
    m.annotate(x, "provenance", provenance("GPS", 0.9));
    m.annotate(y, "provenance", provenance("estimate", 0.4));

    m.rule(
      rule({
        target: z,
        deps: [x, y],
        spec: { op: "sum" },
        eval: (get) => ({ output: get(x) + get(y) }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { x: 5, y: 3 });

    expect(result.layers.get("provenance")?.get("z")).toEqual({
      source: "derived",
      confidence: 0.4,
    });
  });

  it("when all deps have confidence 1, derived has confidence 1", () => {
    const a = key<number>("a");
    const b = key<number>("b");
    const c = key<number>("c");

    const m = createModel();
    m.input(a);
    m.input(b);
    m.layer(provenanceLayer);
    m.annotate(a, "provenance", provenance("user-input"));
    m.annotate(b, "provenance", provenance("database"));

    m.rule(
      rule({
        target: c,
        deps: [a, b],
        spec: { op: "sum" },
        eval: (get) => ({ output: get(a) + get(b) }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { a: 1, b: 2 });

    expect(result.layers.get("provenance")?.get("c")).toEqual({
      source: "derived",
      confidence: 1,
    });
  });

  it("no deps produces unknown with confidence 0", () => {
    const a = key<number>("a");

    const m = createModel();
    m.layer(provenanceLayer);
    // a is an input with no annotation and no deps
    m.input(a);

    m.rule(
      rule({
        target: key<number>("b"),
        deps: [],
        spec: { op: "constant" },
        eval: () => ({ output: 42 }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { a: 1 });

    // Rule with no deps → default fires with empty dep map
    expect(result.layers.get("provenance")?.get("b")).toEqual({
      source: "unknown",
      confidence: 0,
    });
  });

  it("tags are preserved through annotation", () => {
    const a = key<number>("a");
    const b = key<number>("b");

    const m = createModel();
    m.input(a);
    m.layer(provenanceLayer);
    m.annotate(a, "provenance", provenance("auditor", 0.95, ["audited", "final"]));

    m.rule(
      rule({
        target: b,
        deps: [a],
        spec: { op: "identity" },
        eval: (get) => ({ output: get(a) }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { a: 100 });

    expect(result.layers.get("provenance")?.get("a")).toEqual({
      source: "auditor",
      confidence: 0.95,
      tags: ["audited", "final"],
    });
  });
});

describe("codec", () => {
  it("round-trips without tags", () => {
    const p = provenance("user-input", 0.8);
    const encoded = provenanceLayer.codec!.encode(p);
    expect(encoded).toEqual({ confidence: 0.8, source: "user-input" });

    const decoded = provenanceLayer.codec!.decode(encoded);
    expect(decoded).toEqual(p);
  });

  it("round-trips with tags", () => {
    const p = provenance("GPS", 0.95, ["field-measured", "verified"]);
    const encoded = provenanceLayer.codec!.encode(p);
    expect(encoded).toEqual({
      confidence: 0.95,
      source: "GPS",
      tags: ["field-measured", "verified"],
    });

    const decoded = provenanceLayer.codec!.decode(encoded);
    expect(decoded).toEqual(p);
  });

  it("encode omits tags when empty", () => {
    const p = provenance("manual", 1);
    const encoded = provenanceLayer.codec!.encode(p);
    expect(encoded).not.toHaveProperty("tags");
  });
});

describe("full integration", () => {
  it("tracks provenance through a multi-level computation graph", () => {
    const revenue = key<number>("revenue");
    const costs = key<number>("costs");
    const profit = key<number>("profit");
    const margin = key<number>("margin");

    const m = createModel();
    m.input(revenue);
    m.input(costs);
    m.layer(provenanceLayer);
    m.annotate(revenue, "provenance", provenance("ERP", 0.95));
    m.annotate(costs, "provenance", provenance("estimate", 0.6));

    m.rule(
      rule({
        target: profit,
        deps: [revenue, costs],
        spec: { op: "sum" },
        eval: (get) => ({ output: get(revenue) - get(costs) }),
      }),
    );

    m.rule(
      rule({
        target: margin,
        deps: [profit, revenue],
        spec: { op: "ratio" },
        eval: (get) => ({ output: get(profit) / get(revenue) }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { revenue: 1000, costs: 400 });

    // Values
    expect(result.values.get("profit")).toBe(600);
    expect(result.values.get("margin")).toBeCloseTo(0.6);

    const layerMap = result.layers.get("provenance");

    // Input keys have their annotated provenance
    expect(layerMap?.get("revenue")).toEqual({ source: "ERP", confidence: 0.95 });
    expect(layerMap?.get("costs")).toEqual({ source: "estimate", confidence: 0.6 });

    // Computed keys have source: "derived" and min confidence
    expect(layerMap?.get("profit")).toEqual({ source: "derived", confidence: 0.6 });
    // margin depends on profit (0.6) and revenue (0.95) → min is 0.6
    expect(layerMap?.get("margin")).toEqual({ source: "derived", confidence: 0.6 });
  });
});
