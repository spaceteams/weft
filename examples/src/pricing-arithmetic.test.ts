import {
  compileModel,
  createModel,
  defaultNumberOps,
  evaluate,
  explainModelTarget,
  explainTraceTarget,
  key,
  nodeToAsciiTree,
  ratio,
  scale,
  toGraph,
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
    { key: revenue, weight: 1 },
    { key: cost, weight: -1 },
  ]),
  { label: "gross profit" },
);

m.rule(scale(defaultNumberOps, tax, grossProfit, taxRate), { label: "tax" });

m.rule(
  weightedSum(defaultNumberOps, netProfit, [
    { key: grossProfit, weight: 1 },
    { key: tax, weight: -1 },
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
    nodeToAsciiTree(explainModelTarget(compiledModel.model, margin.id), "", true, true),
  ).toMatchInlineSnapshot(`
    "└── margin -> Margin [rule]
        ├── netProfit -> net profit [rule]
        │   ├── grossProfit -> gross profit [rule]
        │   │   ├── revenue -> Revenue [input]
        │   │   └── cost -> Cost [input]
        │   └── tax [rule]
        │       ├── grossProfit -> gross profit [rule]
        │       │   ├── revenue -> Revenue [input]
        │       │   └── cost -> Cost [input]
        │       └── taxRate -> Tax Rate [input]
        └── cost -> Cost [input]"
  `);
});

it("evaluates", () => {
  const result = evaluate(compiledModel.model, { revenue: 1000, cost: 600, taxRate: 0.25 });
  expect(
    nodeToAsciiTree(
      explainTraceTarget(compiledModel.model, result.trace, netProfit.id),
      "",
      true,
      true,
    ),
  ).toMatchInlineSnapshot(`
    "└── netProfit -> net profit [rule] = 300
        ├── grossProfit -> gross profit [rule] = 400
        │   ├── revenue -> Revenue [input] = 1000
        │   └── cost -> Cost [input] = 600
        └── tax [rule] = 100
            ├── grossProfit -> gross profit [rule] = 400
            │   ├── revenue -> Revenue [input] = 1000
            │   └── cost -> Cost [input] = 600
            └── taxRate -> Tax Rate [input] = 0.25"
  `);
});
