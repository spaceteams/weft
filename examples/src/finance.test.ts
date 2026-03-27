import {
  analyzeDraft,
  compileModel,
  createModel,
  defaultNumberOps,
  evaluate,
  inspectDiffTarget,
  inspectionNodeToAscii,
  inspectModelTarget,
  inspectTraceTarget,
  key,
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
    inspectionNodeToAscii(inspectModelTarget(compiledModel.model, total.id), {
      showChange: true,
      showMeta: true,
    }),
  ).toMatchInlineSnapshot(`
    "└── Bilanzsumme [sum]
        ├── Eigenkapital [input]
        └── Fremdkapital [input]"
  `);
});

it("evaluates", () => {
  const result = evaluate(compiledModel.model, { equity: 100, liabilities: 25 });
  expect(
    inspectionNodeToAscii(inspectTraceTarget(compiledModel.model, result.trace, equityRatio.id), {
      showChange: true,
      showMeta: true,
    }),
  ).toMatchInlineSnapshot(`
    "└── Eigenkapitalquote [ratio] = 0.8
        ├── Eigenkapital [input] = 100
        └── Bilanzsumme [sum] = 125
            ├── Eigenkapital [input] = 100
            └── Fremdkapital [input] = 25"
  `);
});

it("evaluates drafts and explains the diff", () => {
  const { evaluated, changes } = analyzeDraft(
    compiledModel.model,
    {
      draftId: "my-draft",
      base: { equity: 100, liabilities: 25 },
      overlay: { liabilities: 10 },
    },
    "lenient",
  );

  expect(
    inspectionNodeToAscii(
      inspectDiffTarget(compiledModel.model, evaluated.result, changes, equityRatio.id),
      { showChange: true, showMeta: true },
    ),
  ).toMatchInlineSnapshot(`
    "└── Eigenkapitalquote [ratio] = 0.8 -> 0.9090909090909091 (changed)
        ├── Eigenkapital [input] = 100
        └── Bilanzsumme [sum] = 125 -> 110 (changed)
            ├── Eigenkapital [input] = 100
            └── Fremdkapital [input] = 25 -> 10 (changed)"
  `);
});
