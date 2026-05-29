import {
  analyzeDraft,
  compileModel,
  createModel,
  defaultNumberOps,
  evaluate,
  evaluateDraft,
  freezeEvaluatedDraft,
  freezeModel,
  inspectionNodeToAscii,
  inspectTraceTarget,
  key,
  ratio,
  sum,
} from "@spaceteams/weft";
import { provenance, provenanceLayer } from "@spaceteams/weft-layer-provenance";
import { describe, expect, it } from "vitest";

describe("provenance layer — finance model", () => {
  const equity = key<number>("equity");
  const liabilities = key<number>("liabilities");
  const total = key<number>("total");
  const equityRatio = key<number>("equityRatio");

  const m = createModel();
  m.layer(provenanceLayer);

  m.input(equity, { label: "Eigenkapital", group: "PASSIVA" });
  m.annotate(equity, "provenance", provenance("balance-sheet", 0.95));

  m.input(liabilities, { label: "Fremdkapital", group: "PASSIVA" });
  m.annotate(liabilities, "provenance", provenance("balance-sheet", 0.9));

  m.rule(sum(defaultNumberOps, total, [equity, liabilities]), { label: "Bilanzsumme" });
  m.rule(ratio(defaultNumberOps, equityRatio, equity, total), { label: "Eigenkapitalquote" });

  const compiled = compileModel(m.build());
  if (!compiled.ok) throw new Error(compiled.issues.map((i) => i.message).join());
  const model = compiled.model;

  it("inputs have annotated provenance", () => {
    const result = evaluate(model, { equity: 100, liabilities: 25 });
    const prov = result.layers.get("provenance");

    expect(prov).toBeDefined();
    expect(prov!.get("equity")).toEqual({ source: "balance-sheet", confidence: 0.95 });
    expect(prov!.get("liabilities")).toEqual({ source: "balance-sheet", confidence: 0.9 });
  });

  it("computed values are derived with min confidence", () => {
    const result = evaluate(model, { equity: 100, liabilities: 25 });
    const prov = result.layers.get("provenance");

    // total depends on equity (0.95) and liabilities (0.9) → min = 0.9
    expect(prov!.get("total")).toEqual({ source: "derived", confidence: 0.9 });

    // equityRatio depends on equity (0.95) and total (derived, 0.9) → min = 0.9
    expect(prov!.get("equityRatio")).toEqual({ source: "derived", confidence: 0.9 });
  });

  it("renders provenance in ASCII inspection", () => {
    const result = evaluate(model, { equity: 100, liabilities: 25 });
    const ascii = inspectionNodeToAscii(inspectTraceTarget(model, result.trace, equityRatio.id), {
      showMeta: true,
      showChange: false,
      showLayers: true,
    });
    expect(ascii).toMatchInlineSnapshot(`
      "└── Eigenkapitalquote [ratio] = 0.8 {provenance: {"source":"derived","confidence":0.9}}
          ├── Eigenkapital [input] = 100 {provenance: {"source":"balance-sheet","confidence":0.95}}
          └── Bilanzsumme [sum] = 125 {provenance: {"source":"derived","confidence":0.9}}
              ├── Eigenkapital [input] = 100 {provenance: {"source":"balance-sheet","confidence":0.95}}
              └── Fremdkapital [input] = 25 {provenance: {"source":"balance-sheet","confidence":0.9}}"
    `);
  });
});

describe("provenance layer — mixed confidence sources", () => {
  const gpsDistance = key<number>("gps_distance");
  const estimatedTime = key<number>("estimated_time");
  const speed = key<number>("speed");

  const m = createModel();
  m.layer(provenanceLayer);

  m.input(gpsDistance, { label: "GPS Distance" });
  m.annotate(gpsDistance, "provenance", provenance("GPS", 0.98, ["field-measured"]));

  m.input(estimatedTime, { label: "Estimated Time" });
  m.annotate(estimatedTime, "provenance", provenance("estimate", 0.6));

  m.rule(ratio(defaultNumberOps, speed, gpsDistance, estimatedTime), { label: "Speed" });

  const compiled = compileModel(m.build());
  if (!compiled.ok) throw new Error(compiled.issues.map((i) => i.message).join());
  const model = compiled.model;

  it("derived speed gets min confidence (0.6 from estimate)", () => {
    const result = evaluate(model, { gps_distance: 1000, estimated_time: 120 });
    const prov = result.layers.get("provenance");

    expect(prov!.get("gps_distance")).toEqual({
      source: "GPS",
      confidence: 0.98,
      tags: ["field-measured"],
    });
    expect(prov!.get("estimated_time")).toEqual({ source: "estimate", confidence: 0.6 });
    expect(prov!.get("speed")).toEqual({ source: "derived", confidence: 0.6 });
  });
});

describe("provenance layer — freeze/hydrate round-trip", () => {
  const a = key<number>("a");
  const b = key<number>("b");
  const total = key<number>("total");

  const m = createModel();
  m.layer(provenanceLayer);

  m.input(a, { label: "A" });
  m.annotate(a, "provenance", provenance("user-input", 1));

  m.input(b, { label: "B" });
  m.annotate(b, "provenance", provenance("api", 0.8));

  m.rule(sum(defaultNumberOps, total, [a, b]), { label: "Total" });

  const compiled = compileModel(m.build());
  if (!compiled.ok) throw new Error(compiled.issues.map((i) => i.message).join());
  const model = compiled.model;

  it("layer data survives freezeModel", () => {
    const frozen = freezeModel(model);
    expect(frozen.layers).toBeDefined();
    expect(frozen.layers!.length).toBe(1);
    expect(frozen.layers![0].name).toBe("provenance");
    expect(frozen.layers![0].version).toBe("1");
    expect(frozen.layers![0].inputs.a).toEqual({ confidence: 1, source: "user-input" });
    expect(frozen.layers![0].inputs.b).toEqual({ confidence: 0.8, source: "api" });
  });

  it("layer results survive freezeEvaluatedDraft", () => {
    const evaluated = evaluateDraft(
      model,
      { draftId: "d", base: { a: 10, b: 20 }, overlay: { b: 30 } },
      "lenient",
    );
    const frozen = freezeEvaluatedDraft(model, evaluated);

    expect(frozen.layers).toBeDefined();
    expect(frozen.layers!.provenance).toBeDefined();
    expect(frozen.layers!.provenance.a).toEqual({ confidence: 1, source: "user-input" });
    expect(frozen.layers!.provenance.b).toEqual({ confidence: 0.8, source: "api" });
    expect(frozen.layers!.provenance.total).toEqual({ confidence: 0.8, source: "derived" });
  });
});

describe("provenance layer — draft analysis with overlay", () => {
  const price = key<number>("price");
  const quantity = key<number>("quantity");
  const total = key<number>("total");

  const m = createModel();
  m.layer(provenanceLayer);

  m.input(price, { label: "Price" });
  m.annotate(price, "provenance", provenance("catalog", 1));

  m.input(quantity, { label: "Quantity" });
  m.annotate(quantity, "provenance", provenance("order", 0.85));

  m.rule(
    {
      __kind: "rule",
      target: total,
      deps: [price, quantity],
      spec: { op: "scale" },
      eval: (get) => ({ output: get(price) * get(quantity) }),
    },
    { label: "Total" },
  );

  const compiled = compileModel(m.build());
  if (!compiled.ok) throw new Error(compiled.issues.map((i) => i.message).join());
  const model = compiled.model;

  it("tracks provenance through draft overlay analysis", () => {
    const analysis = analyzeDraft(
      model,
      {
        draftId: "draft-1",
        base: { price: 10, quantity: 5 },
        overlay: { quantity: 10 },
      },
      "lenient",
    );

    // The overlay result should still carry provenance
    const prov = analysis.evaluated.result.layers.get("provenance");
    expect(prov).toBeDefined();
    expect(prov!.get("total")).toEqual({ source: "derived", confidence: 0.85 });
  });
});
