import {
  analyzeDraft,
  compileModel,
  createModel,
  defaultNumberOps,
  diffToAsciiTree,
  diffToMermaid,
  evaluate,
  explainModelTarget,
  explainTraceTarget,
  key,
  nodeToAsciiTree,
  nodeToMermaid,
  ratio,
  sum,
  toGraph,
} from "@spaceteams/weft";
import { expect, it } from "vitest";

const equity = key<number>("equity");
const liabilities = key<number>("liabilities");
const total = key<number>("total");
const equityRatio = key<number>("equityRatio");

const m = createModel();
m.input(equity, {
  label: "Eigenkapital",
  group: "PASSIVA",
  order: 1,
  unit: "EUR",
  description: "Eigenkapital des Unternehmens",
});
m.input(liabilities, {
  label: "Fremdkapital",
  group: "PASSIVA",
  order: 2,
  unit: "EUR",
  description: "Fremdkapital des Unternehmens",
});

m.rule(sum(defaultNumberOps, total, [equity, liabilities]), { label: "Bilanzsumme" });
m.rule(ratio(defaultNumberOps, equityRatio, equity, total), { label: "Eigenkapitalquote" });

const model = m.build();
const compiledModel = compileModel(model);
if (!compiledModel.ok) {
  expect.fail(compiledModel.issues.map((i) => i.message).join());
}

it("renders a graph", () => {
  expect(toGraph(compiledModel.model)).toEqual({
    nodes: ["equity", "liabilities", "total", "equityRatio"],
    edges: [
      {
        from: "equity",
        to: "total",
      },
      {
        from: "liabilities",
        to: "total",
      },
      {
        from: "equity",
        to: "equityRatio",
      },
      {
        from: "total",
        to: "equityRatio",
      },
    ],
  });
});

it("evaluates", () => {
  const result = evaluate(compiledModel.model, { equity: 100, liabilities: 25 });
  expect(result.order).toEqual(["total", "equityRatio"]);
  expect(result.values.get("total")).toEqual(125);
  expect(result.values.get("equityRatio")).toEqual(0.8);
});

it("explains", () => {
  expect(
    nodeToAsciiTree(explainModelTarget(compiledModel.model, total.id), "", true, true),
  ).toMatchInlineSnapshot(`
    "└── total -> Bilanzsumme [rule]
        ├── equity -> Eigenkapital [input]
        └── liabilities -> Fremdkapital [input]"
  `);
});

it("explains as mermaid", () => {
  expect(nodeToMermaid(explainModelTarget(compiledModel.model, total.id))).toMatchInlineSnapshot(`
    "graph TD
        Bilanzsumme["Bilanzsumme<br/>[rule]"]
        Bilanzsumme -->|equity| Bilanzsumme__equity__Eigenkapital
        Bilanzsumme__equity__Eigenkapital["Eigenkapital<br/>[input]"]
        Bilanzsumme -->|liabilities| Bilanzsumme__liabilities__Fremdkapital
        Bilanzsumme__liabilities__Fremdkapital["Fremdkapital<br/>[input]"]"
  `);
});

it("evaluates", () => {
  const result = evaluate(compiledModel.model, { equity: 100, liabilities: 25 });
  expect(
    nodeToAsciiTree(
      explainTraceTarget(compiledModel.model, result.trace, equityRatio.id),
      "",
      true,
      true,
    ),
  ).toMatchInlineSnapshot(`
    "└── equityRatio -> Eigenkapitalquote [rule] = 0.8
        ├── equity -> Eigenkapital [input] = 100
        └── total -> Bilanzsumme [rule] = 125
            ├── equity -> Eigenkapital [input] = 100
            └── liabilities -> Fremdkapital [input] = 25"
  `);
});

it("evaluates drafts and explains the diff", () => {
  const { explainedDiffs } = analyzeDraft(
    compiledModel.model,
    {
      draftId: "my-draft",
      base: { equity: 100, liabilities: 25 },
      overlay: { liabilities: 10 },
    },
    "lenient",
  );

  // default: all flags true
  expect(diffToAsciiTree(explainedDiffs)).toMatchInlineSnapshot(`
    "├── liabilities -> Fremdkapital [input]: 25 → 10
    ├── total -> Bilanzsumme [rule]: 125 → 110
    │   ├── equity -> Eigenkapital [input] (unchanged)
    │   └── liabilities -> Fremdkapital [input] (changed)
    └── equityRatio -> Eigenkapitalquote [rule]: 0.8 → 0.9090909090909091
        ├── equity -> Eigenkapital [input] (unchanged)
        └── total -> Bilanzsumme [rule] (changed)"
  `);

  // compact: no labels, no kind, no deps
  expect(
    diffToAsciiTree(explainedDiffs, { showLabels: false, showKind: false, showDeps: false }),
  ).toMatchInlineSnapshot(`
    "├── liabilities: 25 → 10
    ├── total: 125 → 110
    └── equityRatio: 0.8 → 0.9090909090909091"
  `);

  // labels only, no kind or deps
  expect(
    diffToAsciiTree(explainedDiffs, { showKind: false, showDeps: false }),
  ).toMatchInlineSnapshot(`
    "├── liabilities -> Fremdkapital: 25 → 10
    ├── total -> Bilanzsumme: 125 → 110
    └── equityRatio -> Eigenkapitalquote: 0.8 → 0.9090909090909091"
  `);

  // deps but no labels or kind
  expect(
    diffToAsciiTree(explainedDiffs, { showLabels: false, showKind: false }),
  ).toMatchInlineSnapshot(`
    "├── liabilities: 25 → 10
    ├── total: 125 → 110
    │   ├── equity (unchanged)
    │   └── liabilities (changed)
    └── equityRatio: 0.8 → 0.9090909090909091
        ├── equity (unchanged)
        └── total (changed)"
  `);

  expect(diffToMermaid(explainedDiffs)).toMatchInlineSnapshot(`
    "graph TD
        liabilities["Fremdkapital<br/>25 → 10<br/>[input]"]
        total["Bilanzsumme<br/>125 → 110<br/>[rule]"]
        equityRatio["Eigenkapitalquote<br/>0.8 → 0.9090909090909091<br/>[rule]"]
        equity["Eigenkapital<br/>[input]"]
        equity -->|unchanged| total
        liabilities -->|changed| total
        equity -->|unchanged| equityRatio
        total -->|changed| equityRatio"
  `);
});
