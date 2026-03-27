import {
  compileModel,
  createModel,
  defaultNumberOps,
  evaluate,
  inspectionNodeToAscii,
  inspectModelTarget,
  inspectTraceTarget,
  key,
  ratio,
  scale,
  toGraph,
  value,
  weightedSum,
} from "@spaceteams/weft";
import { expect, it } from "vitest";

const revenue = key<number>("revenue");
const cost = key<number>("cost");
const taxRate = key<number>("taxRate");

const grossProfit = key<number>("grossProfit");
const tax = key<number>("tax");
const netProfit = key<number>("netProfit");
const margin = key<number>("margin");

const m = createModel();

m.input(revenue, { label: "Revenue" });
m.input(cost, { label: "Cost" });
m.input(taxRate, { label: "Tax Rate" });

m.rule(
  weightedSum(defaultNumberOps, grossProfit, [
    { key: revenue, weight: value(1) },
    { key: cost, weight: value(-1) },
  ]),
  { label: "gross profit" },
);

m.rule(scale(defaultNumberOps, tax, grossProfit, taxRate), { label: "tax" });

m.rule(
  weightedSum(defaultNumberOps, netProfit, [
    { key: grossProfit, weight: value(1) },
    { key: tax, weight: value(-1) },
  ]),
  { label: "net profit" },
);

m.rule(ratio(defaultNumberOps, margin, netProfit, cost), { label: "Margin" });

const model = m.build();
const compiledModel = compileModel(model);
if (!compiledModel.ok) {
  expect.fail(compiledModel.issues.map((i) => i.message).join());
}

it("renders a graph", () => {
  expect(toGraph(compiledModel.model)).toEqual({
    nodes: ["revenue", "cost", "taxRate", "grossProfit", "tax", "netProfit", "margin"],
    edges: [
      { from: "revenue", to: "grossProfit" },
      { from: "cost", to: "grossProfit" },
      { from: "grossProfit", to: "tax" },
      { from: "taxRate", to: "tax" },
      { from: "grossProfit", to: "netProfit" },
      { from: "tax", to: "netProfit" },
      { from: "netProfit", to: "margin" },
      { from: "cost", to: "margin" },
    ],
  });
});

it("explains", () => {
  expect(
    inspectionNodeToAscii(inspectModelTarget(compiledModel.model, margin.id), {
      showChange: true,
      showMeta: true,
    }),
  ).toMatchInlineSnapshot(`
    "└── Margin [ratio]
        ├── net profit [weighted-sum]
        │   ├── gross profit [weighted-sum]
        │   │   ├── Revenue [input]
        │   │   └── Cost [input]
        │   └── tax [scale]
        │       ├── gross profit [weighted-sum]
        │       │   ├── Revenue [input]
        │       │   └── Cost [input]
        │       └── Tax Rate [input]
        └── Cost [input]"
  `);
});

it("evaluates", () => {
  const result = evaluate(compiledModel.model, { revenue: 1000, cost: 600, taxRate: 0.25 });
  expect(
    inspectionNodeToAscii(inspectTraceTarget(compiledModel.model, result.trace, netProfit.id), {
      showMeta: true,
      showChange: false,
    }),
  ).toMatchInlineSnapshot(`
    "└── net profit [weighted-sum] = 300
        ├── gross profit [weighted-sum] = 400
        │   ├── Revenue [input] = 1000
        │   └── Cost [input] = 600
        └── tax [scale] = 100
            ├── gross profit [weighted-sum] = 400
            │   ├── Revenue [input] = 1000
            │   └── Cost [input] = 600
            └── Tax Rate [input] = 0.25"
  `);
});
