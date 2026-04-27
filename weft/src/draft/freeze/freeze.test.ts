import { describe, expect, it } from "vitest";
import { compileModel, createModel, defaultNumberOps, key, ratio, sum } from "../../index";
import { inspectTraceTarget } from "../../inspect/inspect-trace-target";
import { inspectionNodeToAscii } from "../../inspect/inspection-node-to-ascii";
import { evaluateDraft } from "../evaluate-draft";
import { freezeEvaluatedDraft } from "./freeze-evaluated-draft";
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
