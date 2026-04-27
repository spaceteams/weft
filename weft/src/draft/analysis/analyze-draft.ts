import { defaultEvaluateMode } from "../../evaluate";
import type { CompiledModel } from "../../model";
import type { DiffGroup } from "../../overlay/diff-group";
import { groupDiffByOrigin } from "../../overlay/diff-group";
import { type Change, explainDiffs } from "../../overlay/explain-diff";
import type { Draft } from "..";
import { type EvaluatedDraft, evaluateDraft } from "../evaluate-draft";
import type { NormalizationIssue } from "../normalize-draft";
import { normalizeDraft } from "../normalize-draft";
import { analyzeImpact, type ImpactAnalysis } from "./analyze-impact";

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

/**
 * Full draft analysis: normalize → evaluate → impact-analyze → group diffs → explain changes.
 *
 * Returns a rich {@link DraftAnalysis} with live objects suitable for
 * inspection, UI rendering, and further programmatic use.
 *
 * For the frozen/transport path, use {@link freezeEvaluatedDraft} +
 * {@link freezeModel} and derive analysis on the client.
 */
export function analyzeDraft(
  model: CompiledModel,
  draft: Draft,
  mode = defaultEvaluateMode,
): DraftAnalysis {
  const normalized = normalizeDraft(model, draft);
  const evaluated = evaluateDraft(model, normalized.draft, mode);
  const impact = analyzeImpact(model, evaluated.result.origins, evaluated.deltas);
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
