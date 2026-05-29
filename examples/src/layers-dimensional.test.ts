import {
  compileModel,
  createModel,
  defaultNumberOps,
  evaluate,
  inspectionNodeToAscii,
  inspectTraceTarget,
  key,
  numericRules,
  ratio,
  scale,
  sum,
} from "@spaceteams/weft";
import { dimensionalLayer, formatUnit, unit } from "@spaceteams/weft-layer-dimensional";
import { describe, expect, it } from "vitest";

const n = numericRules;

describe("dimensional analysis layer — speed calculation", () => {
  const distance = key<number>("distance");
  const time = key<number>("time");
  const speed = key<number>("speed");

  const m = createModel();
  m.layer(dimensionalLayer);

  m.input(distance, { label: "Distance" });
  m.annotate(distance, "units", unit("m"));

  m.input(time, { label: "Time" });
  m.annotate(time, "units", unit("s"));

  m.rule(ratio(defaultNumberOps, speed, distance, time), { label: "Speed" });

  const compiled = compileModel(m.build());
  if (!compiled.ok) throw new Error(compiled.issues.map((i) => i.message).join());
  const model = compiled.model;

  it("propagates m/s through ratio", () => {
    const result = evaluate(model, { distance: 100, time: 2 });
    expect(result.values.get("speed")).toBe(50);

    const units = result.layers.get("units");
    expect(units).toBeDefined();
    expect(units!.get("distance")).toEqual({ num: ["m"], denom: [] });
    expect(units!.get("time")).toEqual({ num: ["s"], denom: [] });
    expect(units!.get("speed")).toEqual({ num: ["m"], denom: ["s"] });
    expect(formatUnit(units!.get("speed") as { num: string[]; denom: string[] })).toBe("m/s");
  });

  it("renders units in ASCII inspection", () => {
    const result = evaluate(model, { distance: 100, time: 2 });
    const ascii = inspectionNodeToAscii(inspectTraceTarget(model, result.trace, speed.id), {
      showMeta: true,
      showChange: false,
      showLayers: true,
    });
    expect(ascii).toMatchInlineSnapshot(`
      "└── Speed [ratio] = 50 {units: {"num":["m"],"denom":["s"]}}
          ├── Distance [input] = 100 {units: {"num":["m"],"denom":[]}}
          └── Time [input] = 2 {units: {"num":["s"],"denom":[]}}"
    `);
  });
});

describe("dimensional analysis — additive rules preserve units", () => {
  const revenue = key<number>("revenue");
  const costs = key<number>("costs");
  const profit = key<number>("profit");
  const margin = key<number>("margin");

  const m = createModel();
  m.layer(dimensionalLayer);

  m.input(revenue, { label: "Revenue" });
  m.annotate(revenue, "units", unit("EUR"));

  m.input(costs, { label: "Costs" });
  m.annotate(costs, "units", unit("EUR"));

  m.rule(n.difference(profit, revenue, costs), { label: "Profit" });
  m.rule(ratio(defaultNumberOps, margin, profit, revenue), { label: "Margin" });

  const compiled = compileModel(m.build());
  if (!compiled.ok) throw new Error(compiled.issues.map((i) => i.message).join());
  const model = compiled.model;

  it("difference preserves EUR, ratio gives dimensionless", () => {
    const result = evaluate(model, { revenue: 1000, costs: 600 });
    const units = result.layers.get("units");

    expect(formatUnit(units!.get("profit") as { num: string[]; denom: string[] })).toBe("EUR");
    // EUR / EUR = dimensionless
    expect(units!.get("margin")).toEqual({ num: [], denom: [] });
  });
});

describe("dimensional analysis — scale multiplies units", () => {
  const area = key<number>("area");
  const height = key<number>("height");
  const volume = key<number>("volume");

  const m = createModel();
  m.layer(dimensionalLayer);

  m.input(area, { label: "Area" });
  m.annotate(area, "units", { num: ["m", "m"], denom: [] });

  m.input(height, { label: "Height" });
  m.annotate(height, "units", unit("m"));

  m.rule(scale(defaultNumberOps, volume, area, height), { label: "Volume" });

  const compiled = compileModel(m.build());
  if (!compiled.ok) throw new Error(compiled.issues.map((i) => i.message).join());
  const model = compiled.model;

  it("multiplies m² × m = m³", () => {
    const result = evaluate(model, { area: 10, height: 3 });
    const units = result.layers.get("units");
    expect(units!.get("volume")).toEqual({ num: ["m", "m", "m"], denom: [] });
    expect(formatUnit(units!.get("volume") as { num: string[]; denom: string[] })).toBe("m³");
  });
});

describe("dimensional analysis — mismatched units", () => {
  const distance = key<number>("distance");
  const time = key<number>("time");
  const total = key<number>("total");

  const m = createModel();
  m.layer(dimensionalLayer);

  m.input(distance, { label: "Distance" });
  m.annotate(distance, "units", unit("m"));

  m.input(time, { label: "Time" });
  m.annotate(time, "units", unit("s"));

  // Adding m + s — dimensionally invalid, layer returns undefined (sparse)
  m.rule(sum(defaultNumberOps, total, [distance, time]));

  const compiled = compileModel(m.build());
  if (!compiled.ok) throw new Error(compiled.issues.map((i) => i.message).join());
  const model = compiled.model;

  it("returns undefined for sum of mismatched units", () => {
    const result = evaluate(model, { distance: 100, time: 5 });
    const units = result.layers.get("units");
    // The layer should NOT have a value for total (dimensional mismatch)
    expect(units!.has("total")).toBe(false);
  });
});

describe("dimensional analysis — financial ops preserve monetary unit", () => {
  const rate = key<number>("rate");
  const nper = key<number>("nper");
  const pmt = key<number>("pmt");
  const pv = key<number>("pv");
  const fv = key<number>("fv");

  const m = createModel();
  m.layer(dimensionalLayer);

  m.input(rate, { label: "Rate" });
  // rate is dimensionless (a ratio)

  m.input(nper, { label: "Periods" });
  // periods is dimensionless

  m.input(pmt, { label: "Payment" });
  m.annotate(pmt, "units", unit("EUR"));

  m.input(pv, { label: "Present Value" });
  m.annotate(pv, "units", unit("EUR"));

  m.rule(n.futureValue(fv, rate, nper, pmt, pv), { label: "Future Value" });

  const compiled = compileModel(m.build());
  if (!compiled.ok) throw new Error(compiled.issues.map((i) => i.message).join());
  const model = compiled.model;

  it("future value inherits EUR from present value", () => {
    const result = evaluate(model, { rate: 0.05, nper: 10, pmt: 0, pv: 1000 });
    const units = result.layers.get("units");
    expect(formatUnit(units!.get("fv") as { num: string[]; denom: string[] })).toBe("EUR");
  });
});
