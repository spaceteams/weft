import {
  abs,
  annuityPayment,
  clamp,
  compileModel,
  conditional,
  createModel,
  defaultNumberOps,
  difference,
  evaluate,
  evaluateOverlay,
  futureValue,
  inspectionNodeToAscii,
  inspectModelTarget,
  inspectTraceTarget,
  key,
  maximum,
  minimum,
  negate,
  product,
  round,
  value,
} from "@spaceteams/weft";
import { describe, expect, it } from "vitest";

describe("arithmetic rule factories", () => {
  const revenue = key<number>("revenue");
  const costs = key<number>("costs");
  const profit = key<number>("profit");
  const negProfit = key<number>("negProfit");
  const absProfit = key<number>("absProfit");

  const m = createModel();
  m.input(revenue, { label: "Revenue" });
  m.input(costs, { label: "Costs" });
  m.rule(difference(defaultNumberOps, profit, revenue, costs), { label: "Profit" });
  m.rule(negate(defaultNumberOps, negProfit, profit), { label: "Neg Profit" });
  m.rule(abs(defaultNumberOps, absProfit, profit), { label: "Abs Profit" });

  const compiled = compileModel(m.build());
  if (!compiled.ok) {
    throw new Error(compiled.issues.map((i) => i.message).join());
  }
  const model = compiled.model;

  it("evaluates difference, negate, abs", () => {
    const result = evaluate(model, { revenue: 100, costs: 150 });
    expect(result.values.get("profit")).toBe(-50);
    expect(result.values.get("negProfit")).toBe(50);
    expect(result.values.get("absProfit")).toBe(50);
  });

  it("inspects model target", () => {
    expect(
      inspectionNodeToAscii(inspectModelTarget(model, absProfit.id), {
        showMeta: true,
        showChange: true,
      }),
    ).toMatchInlineSnapshot(`
      "└── Abs Profit [abs]
          └── Profit [difference]
              ├── Revenue [input]
              └── Costs [input]"
    `);
  });
});

describe("product and min/max", () => {
  const a = key<number>("a");
  const b = key<number>("b");
  const c = key<number>("c");
  const prod = key<number>("prod");
  const lo = key<number>("lo");
  const hi = key<number>("hi");

  const m = createModel();
  m.input(a, { label: "A" });
  m.input(b, { label: "B" });
  m.input(c, { label: "C" });
  m.rule(product(defaultNumberOps, prod, [a, b, c]), { label: "Product" });
  m.rule(minimum(defaultNumberOps, lo, [a, b, c]), { label: "Min" });
  m.rule(maximum(defaultNumberOps, hi, [a, b, c]), { label: "Max" });

  const compiled = compileModel(m.build());
  if (!compiled.ok) {
    throw new Error(compiled.issues.map((i) => i.message).join());
  }
  const model = compiled.model;

  it("evaluates product, min, max", () => {
    const result = evaluate(model, { a: 2, b: 5, c: 3 });
    expect(result.values.get("prod")).toBe(30);
    expect(result.values.get("lo")).toBe(2);
    expect(result.values.get("hi")).toBe(5);
  });
});

describe("clamp, round, conditional", () => {
  const score = key<number>("score");
  const clamped = key<number>("clamped");
  const rounded = key<number>("rounded");
  const isHigh = key<boolean>("isHigh");
  const bonus = key<number>("bonus");

  const m = createModel();
  m.input(score, { label: "Score" });
  m.input(isHigh, { label: "Is High" });
  m.rule(clamp(defaultNumberOps, clamped, score, value(0), value(100)), { label: "Clamped" });
  m.rule(round(rounded, score, { decimals: 1 }), { label: "Rounded" });
  m.rule(conditional(bonus, isHigh, value(500), value(100)), { label: "Bonus" });

  const compiled = compileModel(m.build());
  if (!compiled.ok) {
    throw new Error(compiled.issues.map((i) => i.message).join());
  }
  const model = compiled.model;

  it("clamps and rounds", () => {
    const result = evaluate(model, { score: 105.67, isHigh: true });
    expect(result.values.get("clamped")).toBe(100);
    expect(result.values.get("rounded")).toBe(105.7);
    expect(result.values.get("bonus")).toBe(500);
  });

  it("conditional false branch", () => {
    const result = evaluate(model, { score: 50, isHigh: false });
    expect(result.values.get("bonus")).toBe(100);
  });

  it("inspects trace with detail annotations", () => {
    const result = evaluate(model, { score: 105.67, isHigh: true });
    expect(
      inspectionNodeToAscii(inspectTraceTarget(model, result.trace, clamped.id), {
        showMeta: true,
        showChange: false,
      }),
    ).toMatchInlineSnapshot(`
      "└── Clamped [clamp] = 100 :: clamped
          └── Score [input] = 105.67"
    `);
    expect(
      inspectionNodeToAscii(inspectTraceTarget(model, result.trace, rounded.id), {
        showMeta: true,
        showChange: false,
      }),
    ).toMatchInlineSnapshot(`
      "└── Rounded [round] = 105.7 :: round(1)
          └── Score [input] = 105.67"
    `);
    expect(
      inspectionNodeToAscii(inspectTraceTarget(model, result.trace, bonus.id), {
        showMeta: true,
        showChange: false,
      }),
    ).toMatchInlineSnapshot(`
      "└── Bonus [conditional] = 500 :: then
          └── Is High [input] = true"
    `);
  });

  it("inspects conditional otherwise branch", () => {
    const result = evaluate(model, { score: 50, isHigh: false });
    expect(
      inspectionNodeToAscii(inspectTraceTarget(model, result.trace, bonus.id), {
        showMeta: true,
        showChange: false,
      }),
    ).toMatchInlineSnapshot(`
      "└── Bonus [conditional] = 100 :: otherwise
          └── Is High [input] = false"
    `);
  });

  it("no annotation when value is not clamped", () => {
    const result = evaluate(model, { score: 50, isHigh: false });
    expect(
      inspectionNodeToAscii(inspectTraceTarget(model, result.trace, clamped.id), {
        showMeta: true,
        showChange: false,
      }),
    ).toMatchInlineSnapshot(`
      "└── Clamped [clamp] = 50
          └── Score [input] = 50"
    `);
  });
});

describe("financial rules", () => {
  const rate = key<number>("rate");
  const nper = key<number>("nper");
  const pmt = key<number>("pmt");
  const pv = key<number>("pv");
  const fv = key<number>("fv");
  const payment = key<number>("payment");

  const m = createModel();
  m.input(rate, { label: "Rate" });
  m.input(nper, { label: "Periods" });
  m.input(pmt, { label: "Payment" });
  m.input(pv, { label: "Present Value" });
  m.rule(futureValue(defaultNumberOps, fv, rate, nper, pmt, pv), { label: "Future Value" });
  m.rule(annuityPayment(defaultNumberOps, payment, rate, nper, pv), { label: "Annuity PMT" });

  const compiled = compileModel(m.build());
  if (!compiled.ok) {
    throw new Error(compiled.issues.map((i) => i.message).join());
  }
  const model = compiled.model;

  it("computes future value and annuity payment", () => {
    const result = evaluate(model, { rate: 0.05, nper: 10, pmt: 0, pv: 1000 });
    expect(result.values.get("fv")).toBeCloseTo(1628.89, 2);
    expect(result.values.get("payment")).toBeCloseTo(129.5, 2);
  });

  it("what-if with overlay", () => {
    const base = { rate: 0.05, nper: 10, pmt: 0, pv: 1000 };
    const overlay = { rate: 0.03 };
    const result = evaluateOverlay(model, base, overlay);
    expect(result.values.get("fv")).toBeCloseTo(1343.92, 2);
  });

  it("inspects trace", () => {
    // Use inputs that produce an exact binary float (1000 * 1.25² = 1562.5)
    // to avoid platform-dependent trailing-digit differences.
    const result = evaluate(model, { rate: 0.25, nper: 2, pmt: 0, pv: 1000 });
    const ascii = inspectionNodeToAscii(inspectTraceTarget(model, result.trace, fv.id), {
      showMeta: true,
      showChange: true,
    });
    expect(ascii).toMatchInlineSnapshot(`
      "└── Future Value [future-value] = 1562.5
          ├── Rate [input] = 0.25
          ├── Periods [input] = 2
          ├── Payment [input] = 0
          └── Present Value [input] = 1000"
    `);
  });
});
