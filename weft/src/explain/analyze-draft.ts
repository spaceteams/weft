import type { Draft } from "../draft";
import { type EvaluatedDraft, evaluateDraft } from "../draft/evaluate-draft";
import { defaultEvaluateMode } from "../evaluate";
import type { CompiledModel } from "../model";
import { type DiffGroup, groupDiffByOrigin } from "../overlay/diff-group";
import { type ExplainedDelta, explainDiffs } from "./explain-diff";

export type DraftAnalysis = {
  readonly evaluated: EvaluatedDraft;
  readonly groupedDiffs: readonly DiffGroup[];
  readonly explainedDiffs: readonly ExplainedDelta[];
};

export function analyzeDraft(
  model: CompiledModel,
  draft: Draft,
  mode = defaultEvaluateMode,
): DraftAnalysis {
  const evaluated = evaluateDraft(model, draft, mode);
  return {
    evaluated,
    groupedDiffs: groupDiffByOrigin(evaluated.result, evaluated.deltas),
    explainedDiffs: explainDiffs(model, evaluated.result, evaluated.deltas),
  };
}
