import { describe, expect, it } from "vitest";
import { compileModel, createModel, defaultNumberOps, key, ratio, sum } from "../../index";
import { inspectTraceTarget } from "../../inspect/inspect-trace-target";
import { inspectionNodeToAscii } from "../../inspect/inspection-node-to-ascii";
import type { Key } from "../../key";
import type { Rule } from "../../rule";
import { match, switchOn, when } from "../../rule/decision-dsl";
import { value } from "../../value";
import { evaluateDraft } from "../evaluate-draft";
import { freezeEvaluatedDraft } from "./freeze-evaluated-draft";
import { parseFrozenArtifact } from "./parse";
import { CURRENT_FROZEN_VERSION } from "./version";

// ---------------------------------------------------------------------------
// Shared model fixture
// ---------------------------------------------------------------------------

const equity = key<number>("equity");
const liabilities = key<number>("liabilities");
const total = key<number>("total");
const equityRatio = key<number>("equityRatio");

const m = createModel();
m.input(equity, { label: "Eigenkapital", group: "PASSIVA" });
m.input(liabilities, { label: "Fremdkapital", group: "PASSIVA" });
m.rule(sum(defaultNumberOps, total, [equity, liabilities]), { label: "Bilanzsumme" });
m.rule(ratio(defaultNumberOps, equityRatio, equity, total), {
  label: "Eigenkapitalquote",
});

const compiled = compileModel(m.build());
if (!compiled.ok) {
  throw new Error(compiled.issues.map((i) => i.message).join());
}
const model = compiled.model;

const baseFacts = { equity: 100, liabilities: 25 };
const draft = { draftId: "test-draft", base: baseFacts, overlay: { liabilities: 10 } };

// ---------------------------------------------------------------------------
// freezeEvaluatedDraft
// ---------------------------------------------------------------------------

describe("freezeEvaluatedDraft", () => {
  it("includes version", () => {
    const evaluated = evaluateDraft(model, draft, "lenient");
    const frozen = freezeEvaluatedDraft(model, evaluated);

    expect(frozen.version).toBe(CURRENT_FROZEN_VERSION);
  });

  it("includes a canonical trace with one entry per rule target", () => {
    const evaluated = evaluateDraft(model, draft, "lenient");
    const frozen = freezeEvaluatedDraft(model, evaluated);

    expect(frozen.trace).toBeDefined();
    expect(frozen.trace.length).toBe(evaluated.result.trace.length);
    expect(frozen.trace.map((s) => s.target)).toEqual(evaluated.result.trace.map((s) => s.target));
  });

  it("canonicalizes trace inputs and outputs", () => {
    const evaluated = evaluateDraft(model, draft, "lenient");
    const frozen = freezeEvaluatedDraft(model, evaluated);

    const totalStep = frozen.trace.find((s) => s.target === "total");
    expect(totalStep).toBeDefined();
    expect(totalStep!.output).toBe(110);
    expect(totalStep!.inputs).toEqual({ equity: 100, liabilities: 10 });
  });

  it("preserves trace deps for tree reconstruction", () => {
    const evaluated = evaluateDraft(model, draft, "lenient");
    const frozen = freezeEvaluatedDraft(model, evaluated);

    const ratioStep = frozen.trace.find((s) => s.target === "equityRatio");
    expect(ratioStep).toBeDefined();
    expect(ratioStep!.deps).toEqual(["equity", "total"]);
  });

  it("freezes layer results when layers are registered", () => {
    const a = key<number>("a");
    const b = key<number>("b");

    const ml = createModel();
    ml.input(a, { label: "A" });
    ml.layer({
      name: "tag",
      version: "1",
      eval() {
        return "derived";
      },
    });
    ml.annotate(a, "tag", "input-tag");
    ml.rule(
      {
        __kind: "rule",
        target: b,
        deps: [a],
        spec: { op: "identity" },
        eval: (get) => ({ output: get(a) }),
      },
      { label: "B" },
    );

    const compiled = compileModel(ml.build());
    if (!compiled.ok) throw new Error("compile failed");
    const lm = compiled.model;

    const evaluated = evaluateDraft(
      lm,
      { draftId: "d", base: { a: 1 }, overlay: { a: 2 } },
      "lenient",
    );
    const frozen = freezeEvaluatedDraft(lm, evaluated);

    expect(frozen.layers).toBeDefined();
    expect(frozen.layers!.tag).toBeDefined();
    expect(frozen.layers!.tag.a).toBe("input-tag");
    expect(frozen.layers!.tag.b).toBe("derived");
  });
});

// ---------------------------------------------------------------------------
// Inspection from frozen artifacts — regression tests
//
// The live and frozen paths must produce identical ASCII output.
// ---------------------------------------------------------------------------

describe("inspectTraceTarget: live vs frozen", () => {
  it("produces identical ASCII for a leaf target", () => {
    const evaluated = evaluateDraft(model, draft, "lenient");
    const frozen = freezeEvaluatedDraft(model, evaluated);

    const liveTree = inspectTraceTarget(model, evaluated.result.trace, equityRatio.id);
    const frozenTree = inspectTraceTarget(model, frozen.trace, equityRatio.id);

    const opts = { showMeta: true, showChange: true } as const;
    expect(inspectionNodeToAscii(frozenTree, opts)).toBe(inspectionNodeToAscii(liveTree, opts));
  });

  it("produces identical ASCII for an intermediate target", () => {
    const evaluated = evaluateDraft(model, draft, "lenient");
    const frozen = freezeEvaluatedDraft(model, evaluated);

    const liveTree = inspectTraceTarget(model, evaluated.result.trace, total.id);
    const frozenTree = inspectTraceTarget(model, frozen.trace, total.id);

    const opts = { showMeta: true, showChange: true } as const;
    expect(inspectionNodeToAscii(frozenTree, opts)).toBe(inspectionNodeToAscii(liveTree, opts));
  });
});

// ---------------------------------------------------------------------------
// Label-less decision rows must freeze
//
// Regression: match() wrote `matchedRowLabel: row.label` unconditionally, so a
// row without a label produced an own property whose value was `undefined`.
// canonicalizeTraceStep iterates Object.entries(detail) — which includes
// undefined-valued keys — and canonicalize() rejects undefined, so freezing
// threw. switchOn() builds rows that never carry a label, which made every
// switchOn model unfreezable.
// ---------------------------------------------------------------------------

describe("freeze: label-less decision rows", () => {
  function freezeWith(
    inputKey: Key<unknown>,
    theRule: Rule<unknown>,
    facts: Record<string, unknown>,
  ) {
    const mb = createModel();
    mb.input(inputKey);
    mb.rule(theRule);
    const c = compileModel(mb.build());
    if (!c.ok) throw new Error(c.issues.map((i) => i.message).join());
    const evaluated = evaluateDraft(c.model, { draftId: "d", base: facts, overlay: {} }, "lenient");
    return freezeEvaluatedDraft(c.model, evaluated);
  }

  const income = key<number>("income");
  const bracket = key<string>("bracket");

  it("freezes a match whose matched row has no label", () => {
    const frozen = freezeWith(
      income,
      match(bracket, {
        name: "unlabelled",
        rows: [{ id: "low", when: [when(income).lt(10_000)], output: value("low") }],
        default: value("high"),
      }),
      { income: 5_000 },
    );

    expect(frozen.values.bracket).toBe("low");
    const step = frozen.trace.find((t) => t.target === "bracket");
    expect(step?.detail).toEqual({
      op: "match",
      tableName: "unlabelled",
      matchedRowId: "low",
      usedDefault: false,
    });
  });

  it("freezes a switchOn (record-style cases)", () => {
    const category = key<string>("category");
    const price = key<number>("price");

    const frozen = freezeWith(
      category,
      switchOn(category, price, {
        name: "category-pricing",
        cases: { standard: value(100), premium: value(250) },
        default: value(50),
      }),
      { category: "premium" },
    );

    expect(frozen.values.price).toBe(250);
    expect(frozen.trace.find((t) => t.target === "price")?.detail).toEqual({
      op: "match",
      tableName: "category-pricing",
      matchedRowId: "premium",
      usedDefault: false,
    });
  });

  it("freezes a switchOn (array-style cases)", () => {
    const category = key<string>("category");
    const price = key<number>("price");

    const frozen = freezeWith(
      category,
      switchOn(category, price, {
        name: "array-pricing",
        cases: [{ match: ["premium", "gold"], output: value(300) }],
        default: value(50),
      }),
      { category: "gold" },
    );

    expect(frozen.values.price).toBe(300);
    expect(frozen.trace.find((t) => t.target === "price")?.detail).toEqual({
      op: "match",
      tableName: "array-pricing",
      matchedRowId: "case-0",
      usedDefault: false,
    });
  });

  it("survives a JSON round trip", () => {
    const frozen = freezeWith(
      income,
      match(bracket, {
        name: "unlabelled",
        rows: [{ id: "low", when: [when(income).lt(10_000)], output: value("low") }],
        default: value("high"),
      }),
      { income: 5_000 },
    );

    const parsed = parseFrozenArtifact(JSON.parse(JSON.stringify(frozen)));
    expect(parsed.trace.find((t) => t.target === "bracket")?.detail).toEqual({
      op: "match",
      tableName: "unlabelled",
      matchedRowId: "low",
      usedDefault: false,
    });
  });
});
