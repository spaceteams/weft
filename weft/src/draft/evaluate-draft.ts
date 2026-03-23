import type { Draft } from ".";
import { defaultEvaluateMode, evaluate } from "../evaluate";
import type { CompiledModel } from "../model";
import { diffResults, type ValueDelta } from "../overlay/diff-results";
import { evaluateOverlay, type OverlayEvaluationResult } from "../overlay/evaluate-overlay";

export type EvaluatedDraft = {
  readonly draft: Draft
  readonly result: OverlayEvaluationResult
  readonly deltas: readonly ValueDelta[]
};

export function evaluateDraft(model: CompiledModel, draft: Draft, mode = defaultEvaluateMode): EvaluatedDraft {
  const baseResult = evaluate(model, draft.base, mode)
  const result = evaluateOverlay(model, draft.base, draft.overlay, mode)
  const { deltas } = diffResults(model, baseResult, result)

  return {
    draft, result, deltas
  }
}
