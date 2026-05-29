import {
  analyzeDraft,
  compileModel,
  createModel,
  defaultNumberOps,
  evaluate,
  inspectDiffTarget,
  inspectionNodeToAscii,
  inspectTraceTarget,
  key,
  match,
  projection,
  ratio,
  sum,
  value,
  when,
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
  description: "Eigenkapital des Unternehmens",
});
m.input(fremdkapital, {
  label: "Fremdkapital",
  group: "PASSIVA",
  order: 2,
  description: "Fremdkapital des Unternehmens",
});
m.rule(sum(defaultNumberOps, total, [eigenkapital, fremdkapital]), { label: "Bilanzsumme" });
m.rule(ratio(defaultNumberOps, ekQuote, eigenkapital, total), { label: "Eigenkapitalquote" });

const finanzbericht = key<{ guvGliederung: "GKV" | "UKV" }>("finanzbericht");
const guvGliederung = key<"GKV" | "UKV">("guvGliederung");
m.input(finanzbericht, { label: "Finanzbericht" });
m.rule(projection(guvGliederung, finanzbericht, "guvGliederung"), { label: "GUV" });

const umsatzrenditeUkv = key<number>("umsatzrenditeUkv");
const umsatzrenditeGkv = key<number>("umsatzrenditeGkv");
const umsatzrendite = key<number>("umsatzrendite");
m.input(umsatzrenditeUkv, { label: "Umsatzrendite UKV" });
m.input(umsatzrenditeGkv, { label: "Umsatzrendite GKV" });
m.rule(
  match(umsatzrendite, {
    name: "umsatzrendite",
    rows: [
      {
        id: "ukv",
        when: [when(guvGliederung).eq("UKV")],
        output: umsatzrenditeUkv,
      },
      {
        id: "gkv",
        when: [when(guvGliederung).eq("GKV")],
        output: umsatzrenditeGkv,
      },
    ],
  }),
);

const ekQuoteFaktor = key<number>("ekQuoteFaktor");
m.rule(
  match(ekQuoteFaktor, {
    name: "ekFaktorTable",
    rows: [
      {
        id: "band-1",
        when: [when(ekQuote).gte(0.2)],
        output: value(0.1),
      },
      {
        id: "band-2",
        when: [when(ekQuote).gt(-0.2)],
        output: value(0.0),
      },
      {
        id: "band-3",
        when: [when(ekQuote).lte(-0.2)],
        output: value(-0.1),
      },
    ],
  }),
);

const umsatzrenditeFaktor = key<number>("umsatzrenditeFaktor");
m.rule(
  match(umsatzrenditeFaktor, {
    name: "urFaktorTable",
    rows: [
      {
        id: "band-1",
        when: [when(umsatzrendite).gte(0.2)],
        output: value(0.1),
      },
      {
        id: "band-2",
        when: [when(umsatzrendite).gt(-0.2)],
        output: value(0.0),
      },
      {
        id: "band-3",
        when: [when(umsatzrendite).lte(-0.2)],
        output: value(0.1),
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
  const result = evaluate(
    compiledModel.model,
    {
      eigenkapital: 100,
      fremdkapital: 25,
      baseFaktor: 0.4,
      umsatzrenditeUkv: 0.1,
      finanzbericht: { guvGliederung: "UKV" },
    },
    "lenient",
  );
  expect(
    inspectionNodeToAscii(
      inspectTraceTarget(compiledModel.model, result.trace, tarifierungsFaktor.id),
      { showChange: true, showMeta: true },
    ),
  ).toMatchInlineSnapshot(`
    "└── tarifierungsFaktor [sum] = 0.5
        ├── BaseFaktor [input] = 0.4
        ├── umsatzrenditeFaktor [match] = 0 :: band-2
        │   └── umsatzrendite [match] = 0.1 :: ukv
        │       └── GUV [project] = UKV
        │           └── Finanzbericht [input] = [object Object]
        └── ekQuoteFaktor [match] = 0.1 :: band-1
            └── Eigenkapitalquote [ratio] = 0.8
                ├── Eigenkapital [input] = 100
                └── Bilanzsumme [sum] = 125
                    ├── Eigenkapital [input] = 100
                    └── Fremdkapital [input] = 25"
  `);
});

it("evaluates drafts and explains the diff", () => {
  const analysis = analyzeDraft(
    compiledModel.model,
    {
      draftId: "my-draft",
      base: {
        eigenkapital: 100,
        fremdkapital: 25,
        baseFaktor: 0.4,
        umsatzrenditeUkv: 0.1,
        finanzbericht: { guvGliederung: "UKV" },
      },
      overlay: { fremdkapital: 2500 },
    },
    "lenient",
  );
  expect(analysis.impact).toEqual({
    direct: ["fremdkapital"],
    affected: ["total", "ekQuote", "ekQuoteFaktor", "tarifierungsFaktor"],
    terminal: ["tarifierungsFaktor"],
  });

  expect(
    inspectionNodeToAscii(
      inspectDiffTarget(
        compiledModel.model,
        analysis.evaluated.result,
        analysis.changes,
        analysis.impact.terminal[0],
      ),
      { showChange: true, showMeta: true },
    ),
  ).toMatchInlineSnapshot(`
    "└── tarifierungsFaktor [sum] = 0.5 -> 0.4 (changed)
        ├── BaseFaktor [input] = 0.4
        ├── umsatzrenditeFaktor [match] = 0 :: band-2
        │   └── umsatzrendite [match] = 0.1 :: ukv
        │       └── GUV [project] = UKV
        │           └── Finanzbericht [input] = [object Object]
        └── ekQuoteFaktor [match] = 0.1 -> 0 (changed) :: band-2
            └── Eigenkapitalquote [ratio] = 0.8 -> 0.038461538461538464 (changed)
                ├── Eigenkapital [input] = 100
                └── Bilanzsumme [sum] = 125 -> 2600 (changed)
                    ├── Eigenkapital [input] = 100
                    └── Fremdkapital [input] = 25 -> 2500 (changed)"
  `);
});
