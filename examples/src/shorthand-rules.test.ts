import {
  algebraicRules,
  compileModel,
  createModel,
  defaultNumberOps,
  evaluate,
  inspectionNodeToAscii,
  inspectTraceTarget,
  key,
  numericRules,
  sum,
  value,
} from "@spaceteams/weft";
import { describe, expect, it } from "vitest";

const n = numericRules;

describe("numericRules shorthand vs raw factories", () => {
  it("n.sum is equivalent to sum(defaultNumberOps, ...)", () => {
    const a = key<number>("a");
    const b = key<number>("b");
    const total1 = key<number>("total1");
    const total2 = key<number>("total2");

    // Verbose: import { sum, defaultNumberOps } and pass ops explicitly
    const m1 = createModel();
    m1.input(a);
    m1.input(b);
    m1.rule(sum(defaultNumberOps, total1, [a, b]));
    const c1 = compileModel(m1.build());
    if (!c1.ok) throw new Error("compile failed");

    // Shorthand: numericRules pre-binds defaultNumberOps
    const m2 = createModel();
    m2.input(a);
    m2.input(b);
    m2.rule(n.sum(total2, [a, b]));
    const c2 = compileModel(m2.build());
    if (!c2.ok) throw new Error("compile failed");

    const r1 = evaluate(c1.model, { a: 10, b: 20 });
    const r2 = evaluate(c2.model, { a: 10, b: 20 });
    expect(r1.values.get("total1")).toBe(r2.values.get("total2"));
    expect(r1.values.get("total1")).toBe(30);
  });

  it("numericRules provides all arithmetic in one object", () => {
    // numericRules gives you: sum, difference, negate, abs, ratio, scale,
    // weightedSum, product, min, max, futureValue, presentValue, annuityPayment
    const revenue = key<number>("revenue");
    const costs = key<number>("costs");
    const profit = key<number>("profit");
    const margin = key<number>("margin");
    const absProfit = key<number>("absProfit");

    const m = createModel();
    m.input(revenue, { label: "Revenue" });
    m.input(costs, { label: "Costs" });

    m.rule(n.difference(profit, revenue, costs), { label: "Profit" });
    m.rule(n.abs(absProfit, profit), { label: "Abs Profit" });
    m.rule(n.ratio(margin, profit, revenue), { label: "Margin" });

    const compiled = compileModel(m.build());
    if (!compiled.ok) throw new Error(compiled.issues.map((i) => i.message).join());
    const model = compiled.model;

    const result = evaluate(model, { revenue: 200, costs: 250 });
    expect(result.values.get("profit")).toBe(-50);
    expect(result.values.get("absProfit")).toBe(50);
    expect(result.values.get("margin")).toBe(-0.25);

    // Inspection works the same way
    expect(
      inspectionNodeToAscii(inspectTraceTarget(model, result.trace, margin.id), {
        showMeta: true,
        showChange: false,
      }),
    ).toMatchInlineSnapshot(`
      "└── Margin [ratio] = -0.25
          ├── Profit [difference] = -50
          │   ├── Revenue [input] = 200
          │   └── Costs [input] = 250
          └── Revenue [input] = 200"
    `);
  });
});

describe("algebraicRules — custom algebra", () => {
  it("algebraicRules(ops) creates a shorthand for any compatible ops", () => {
    // algebraicRules works with any type that implements the required algebra traits.
    // numericRules is just: algebraicRules(defaultNumberOps)
    //
    // Here we show you could create your own shorthand for a custom ops descriptor.
    // For simplicity we reuse defaultNumberOps, but in practice you might have
    // integer-only ops, decimal ops, or currency ops with specific rounding.
    const intOps = {
      ...defaultNumberOps,
      family: "integer" as const,
      version: "1" as const,
    };

    const custom = algebraicRules(intOps);

    const price = key<number>("price");
    const qty = key<number>("qty");
    const total = key<number>("total");

    const m = createModel();
    m.input(price, { label: "Price" });
    m.input(qty, { label: "Qty" });
    m.rule(custom.scale(total, price, qty), { label: "Total" });

    const compiled = compileModel(m.build());
    if (!compiled.ok) throw new Error(compiled.issues.map((i) => i.message).join());

    const result = evaluate(compiled.model, { price: 25, qty: 4 });
    expect(result.values.get("total")).toBe(100);
  });
});

describe("mixing numericRules with literal values", () => {
  it("value() creates inline constants for operands", () => {
    const income = key<number>("income");
    const taxRate = key<number>("taxRate");
    const tax = key<number>("tax");
    const net = key<number>("net");

    const m = createModel();
    m.input(income, { label: "Income" });
    m.input(taxRate, { label: "Tax Rate" });

    // scale uses an input key as the scalar
    m.rule(n.scale(tax, income, taxRate), { label: "Tax" });

    // weightedSum with value() literals — no need to declare separate keys
    m.rule(
      n.weightedSum(net, [
        { key: income, weight: value(1) },
        { key: tax, weight: value(-1) },
      ]),
      { label: "Net Income" },
    );

    const compiled = compileModel(m.build());
    if (!compiled.ok) throw new Error(compiled.issues.map((i) => i.message).join());

    const result = evaluate(compiled.model, { income: 5000, taxRate: 0.2 });
    expect(result.values.get("tax")).toBe(1000);
    expect(result.values.get("net")).toBe(4000);
  });
});
