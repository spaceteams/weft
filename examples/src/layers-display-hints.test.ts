import {
  compileModel,
  createModel,
  defaultNumberOps,
  evaluate,
  freezeModel,
  hydrateModel,
  inspectionNodeToAscii,
  inspectTraceTarget,
  key,
  ratio,
  sum,
} from "@spaceteams/weft";
import { displayHint, displayHintsLayer } from "@spaceteams/weft-layer-display-hints";
import { describe, expect, it } from "vitest";

describe("display-hints layer in a finance model", () => {
  const equity = key<number>("equity");
  const liabilities = key<number>("liabilities");
  const total = key<number>("total");
  const equityRatio = key<number>("equityRatio");

  const m = createModel();
  m.layer(displayHintsLayer);

  m.input(equity, { label: "Eigenkapital", group: "PASSIVA" });
  m.annotate(equity, "display-hints", displayHint({ unit: "EUR", semanticType: "currency" }));

  m.input(liabilities, { label: "Fremdkapital", group: "PASSIVA" });
  m.annotate(liabilities, "display-hints", displayHint({ unit: "EUR", semanticType: "currency" }));

  m.rule(sum(defaultNumberOps, total, [equity, liabilities]), { label: "Bilanzsumme" });
  m.annotate(total, "display-hints", displayHint({ unit: "EUR", semanticType: "currency" }));

  m.rule(ratio(defaultNumberOps, equityRatio, equity, total), { label: "Eigenkapitalquote" });
  m.annotate(equityRatio, "display-hints", displayHint({ semanticType: "percent" }));

  const compiled = compileModel(m.build());
  if (!compiled.ok) throw new Error(compiled.issues.map((i) => i.message).join());
  const model = compiled.model;

  it("carries display hints through evaluation", () => {
    const result = evaluate(model, { equity: 100, liabilities: 25 });
    const hints = result.layers.get("display-hints");

    expect(hints).toBeDefined();
    expect(hints!.get("equity")).toEqual({ unit: "EUR", semanticType: "currency" });
    expect(hints!.get("liabilities")).toEqual({ unit: "EUR", semanticType: "currency" });
    expect(hints!.get("equityRatio")).toEqual({ semanticType: "percent" });
  });

  it("does NOT propagate to unannotated rules", () => {
    // display-hints is non-propagating, but we explicitly annotated total above
    const result = evaluate(model, { equity: 100, liabilities: 25 });
    const hints = result.layers.get("display-hints");
    expect(hints!.get("total")).toEqual({ unit: "EUR", semanticType: "currency" });
  });

  it("renders layer values in ASCII inspection", () => {
    const result = evaluate(model, { equity: 100, liabilities: 25 });
    const ascii = inspectionNodeToAscii(inspectTraceTarget(model, result.trace, equityRatio.id), {
      showMeta: true,
      showChange: false,
      showLayers: true,
    });
    // Non-propagating layer: only input annotations appear in trace.
    // Rule target annotations are in result.layers but not in trace layerOutputs.
    expect(ascii).toMatchInlineSnapshot(`
      "└── Eigenkapitalquote [ratio] = 0.8
          ├── Eigenkapital [input] = 100 {display-hints: {"unit":"EUR","semanticType":"currency"}}
          └── Bilanzsumme [sum] = 125
              ├── Eigenkapital [input] = 100 {display-hints: {"unit":"EUR","semanticType":"currency"}}
              └── Fremdkapital [input] = 25 {display-hints: {"unit":"EUR","semanticType":"currency"}}"
    `);
  });

  it("survives freeze → hydrate round-trip", () => {
    const frozen = freezeModel(model);
    expect(frozen.layers).toBeDefined();
    expect(frozen.layers!.length).toBe(1);
    expect(frozen.layers![0].name).toBe("display-hints");
    expect(frozen.layers![0].version).toBe("1");

    // Input annotations are preserved
    expect(frozen.layers![0].inputs.equity).toEqual({
      semanticType: "currency",
      unit: "EUR",
    });

    // Hydrate and verify structural data
    const json = JSON.parse(JSON.stringify(frozen));
    const hydrated = hydrateModel(json);
    expect(hydrated.layers).toBeDefined();
    expect(hydrated.layers![0].name).toBe("display-hints");
  });
});
