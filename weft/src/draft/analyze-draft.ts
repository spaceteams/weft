import { defaultEvaluateMode } from "../evaluate";
import type { CompiledModel } from "../model";
import type { DiffGroup } from "../overlay/diff-group";
import { groupDiffByOrigin } from "../overlay/diff-group";
import { type Change, explainDiffs } from "../overlay/explain-diff";
import type { Draft } from ".";
import { analyzeImpact, type ImpactAnalysis } from "./analyze-impact";
import { type EvaluatedDraft, evaluateDraft } from "./evaluate-draft";
import type { NormalizationIssue } from "./normalize-draft";
import { normalizeDraft } from "./normalize-draft";

// ---------------------------------------------------------------------------
// Re-exports so existing consumers of analyze-draft keep working
// ---------------------------------------------------------------------------

export type { ImpactAnalysis } from "./analyze-impact";
export { analyzeImpact } from "./analyze-impact";
export type { FrozenDraftAnalysis } from "./freeze-draft-analysis";
export { freezeDraftAnalysis } from "./freeze-draft-analysis";
export type { NormalizationIssue, NormalizedDraft } from "./normalize-draft";
export { normalizeDraft } from "./normalize-draft";

// ---------------------------------------------------------------------------
// DraftAnalysis — the rich, live result of a full analysis
// ---------------------------------------------------------------------------

export type DraftAnalysis = {
  readonly evaluated: EvaluatedDraft;
  readonly groupedDiffs: readonly DiffGroup[];
  readonly changes: readonly Change[];
  readonly impact: ImpactAnalysis;
  readonly normalizationIssues: readonly NormalizationIssue[];
};

// ---------------------------------------------------------------------------
// Draft operations ladder
//
//   createDraft(...)          → Draft              (construct)
//   normalizeDraft(...)       → NormalizedDraft     (validate & clean)
//   evaluateDraft(...)        → EvaluatedDraft      (run the model)
//   analyzeImpact(...)        → ImpactAnalysis      (what changed?)
//   analyzeDraft(...)         → DraftAnalysis       (full analysis)
//   freezeDraftAnalysis(...)  → FrozenDraftAnalysis  (serialize for persistence)
// ---------------------------------------------------------------------------

/**
 * Full draft analysis: normalize → evaluate → impact-analyze → group diffs → explain changes.
 *
 * Returns a rich {@link DraftAnalysis} with live objects suitable for
 * inspection, UI rendering, and further programmatic use.
 *
 * To serialize the analysis for persistence or transport, pass the result to
 * {@link freezeDraftAnalysis}.
 */
export function analyzeDraft(
  model: CompiledModel,
  draft: Draft,
  mode = defaultEvaluateMode,
): DraftAnalysis {
  const normalized = normalizeDraft(model, draft);
  const evaluated = evaluateDraft(model, normalized.draft, mode);
  const impact = analyzeImpact(model, evaluated);
  const groupedDiffs = groupDiffByOrigin(evaluated.result, evaluated.deltas);
  const changes = explainDiffs(evaluated.result, evaluated.deltas);
  return {
    evaluated,
    groupedDiffs,
    changes,
    impact,
    normalizationIssues: normalized.issues,
  };
}
