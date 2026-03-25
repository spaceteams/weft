import {
  analyzeDraft,
  compileModel,
  createModel,
  decision,
  defaultNumberOps,
  diffToAsciiTree,
  evaluate,
  explainTraceTarget,
  key,
  nodeToAsciiTree,
  ratio,
  sum,
} from "@spaceteams/weft";
import { expect, it } from "vitest";

const eigenkapital = key<number>("eigenkapital");
const fremdkapital = key<number>("fremdkapital");
const total = key<number>("total");
const ekQuote = key<number>("ekQuote");

const m = createModel();
m.input(eigenkapital, {
  label: "Eigenkapital",
  group: "PASSIVA",
  order: 1,
  unit: "EUR",
  description: "Eigenkapital des Unternehmens",
});
m.input(fremdkapital, {
  label: "Fremdkapital",
  group: "PASSIVA",
  order: 2,
  unit: "EUR",
  description: "Fremdkapital des Unternehmens",
});
m.rule(sum(defaultNumberOps, total, [eigenkapital, fremdkapital]), { label: "Bilanzsumme" });
m.rule(ratio(defaultNumberOps, ekQuote, eigenkapital, total), { label: "Eigenkapitalquote" });

const umsatzrendite = key<number>("umsatzrendite");
m.input(umsatzrendite, {
  label: "Umsatzrendite",
});

const ekQuoteFaktor = key<number>("ekQuoteFaktor");
m.rule(
  decision(defaultNumberOps, ekQuoteFaktor, {
    name: "ekFaktorTable",
    rows: [
      {
        id: "band-1",
        when: [{ op: "gte", source: ekQuote, right: { kind: "value", value: 0.2 } }],
        then: 0.1,
      },
      {
        id: "band-2",
        when: [{ op: "gt", source: ekQuote, right: { kind: "value", value: -0.2 } }],
        then: 0.0,
      },
      {
        id: "band-3",
        when: [{ op: "lte", source: ekQuote, right: { kind: "value", value: -0.2 } }],
        then: -0.1,
      },
    ],
  }),
);

const umsatzrenditeFaktor = key<number>("umsatzrenditeFaktor");
m.rule(
  decision(defaultNumberOps, umsatzrenditeFaktor, {
    name: "urFaktorTable",
    rows: [
      {
        id: "band-1",
        when: [{ op: "gte", source: umsatzrendite, right: { kind: "value", value: 0.2 } }],
        then: 0.1,
      },
      {
        id: "band-2",
        when: [{ op: "gt", source: umsatzrendite, right: { kind: "value", value: -0.2 } }],
        then: 0.0,
      },
      {
        id: "band-3",
        when: [{ op: "lte", source: umsatzrendite, right: { kind: "value", value: -0.2 } }],
        then: -0.1,
      },
    ],
  }),
);

const baseFaktor = key<number>("baseFaktor");
m.input(baseFaktor, {
  label: "BaseFaktor",
});

const tarifierungsFaktor = key<number>("tarifierungsFaktor");
m.rule(sum(defaultNumberOps, tarifierungsFaktor, [baseFaktor, umsatzrenditeFaktor, ekQuoteFaktor]));

const model = m.build();
const compiledModel = compileModel(model);
if (!compiledModel.ok) {
  expect.fail(compiledModel.issues.map((i) => i.message).join());
}

it("evaluates", () => {
  const result = evaluate(compiledModel.model, {
    eigenkapital: 100,
    fremdkapital: 25,
    umsatzrendite: 0.1,
    baseFaktor: 0.4,
  });
  expect(
    nodeToAsciiTree(
      explainTraceTarget(compiledModel.model, result.trace, tarifierungsFaktor.id),
      "",
      true,
      true,
    ),
  ).toMatchInlineSnapshot(`
    "└── tarifierungsFaktor [rule] = 0.5
        ├── baseFaktor -> BaseFaktor [input] = 0.4
        ├── umsatzrenditeFaktor [rule] = 0
        │   └── umsatzrendite -> Umsatzrendite [input] = 0.1
        └── ekQuoteFaktor [rule] = 0.1
            └── ekQuote -> Eigenkapitalquote [rule] = 0.8
                ├── eigenkapital -> Eigenkapital [input] = 100
                └── total -> Bilanzsumme [rule] = 125
                    ├── eigenkapital -> Eigenkapital [input] = 100
                    └── fremdkapital -> Fremdkapital [input] = 25"
  `);
});

it("evaluates drafts and explains the diff", () => {
  const { explainedDiffs } = analyzeDraft(
    compiledModel.model,
    {
      draftId: "my-draft",
      base: { eigenkapital: 100, fremdkapital: 25, umsatzrendite: 0.1, baseFaktor: 0.4 },
      overlay: { fremdkapital: 2500 },
    },
    "lenient",
  );

  expect(
    diffToAsciiTree(explainedDiffs, { showLabels: false, showKind: false }),
  ).toMatchInlineSnapshot(`
    "├── fremdkapital: 25 → 2500
    ├── total: 125 → 2600
    │   ├── eigenkapital (unchanged)
    │   └── fremdkapital (changed)
    ├── ekQuote: 0.8 → 0.038461538461538464
    │   ├── eigenkapital (unchanged)
    │   └── total (changed)
    ├── ekQuoteFaktor: 0.1 → 0
    │   └── ekQuote (changed)
    └── tarifierungsFaktor: 0.5 → 0.4
        ├── baseFaktor (unchanged)
        ├── umsatzrenditeFaktor (unchanged)
        └── ekQuoteFaktor (changed)"
  `);
});
