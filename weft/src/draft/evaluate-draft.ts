import { defaultEvaluateMode, type EvaluateMode, evaluate } from "../evaluate";
import { type MaybeAsync, mapAll } from "../maybe-async";
import type { CompiledModel } from "../model";
import { diffResults, type ValueDelta } from "../overlay/diff-results";
import { evaluateOverlay, type OverlayEvaluationResult } from "../overlay/evaluate-overlay";
import { validateEvaluation } from "../validate/validate-evaluation";
import { validateFacts } from "../validate/validate-facts";
import { validateOverlay } from "../validate/validate-overlay";
import type { ValidationContext } from "../validate/validation-context";
import { mergeResults, type ValidationResult } from "../validate/validation-result";
import type { Draft } from ".";

export type EvaluatedDraft = {
  readonly draft: Draft;
  readonly result: OverlayEvaluationResult;
  readonly deltas: readonly ValueDelta[];
  readonly validation?: ValidationResult;
};

export type EvaluateDraftOptions = {
  mode?: EvaluateMode;
  validate?: boolean;
  validationContext?: ValidationContext;
};

export function evaluateDraft(
  model: CompiledModel,
  draft: Draft,
  mode?: EvaluateMode,
): EvaluatedDraft;
export function evaluateDraft(
  model: CompiledModel,
  draft: Draft,
  options: EvaluateDraftOptions,
): MaybeAsync<EvaluatedDraft>;
export function evaluateDraft(
  model: CompiledModel,
  draft: Draft,
  modeOrOptions?: EvaluateMode | EvaluateDraftOptions,
): MaybeAsync<EvaluatedDraft> {
  const { mode, validate, validationContext } = resolveOptions(modeOrOptions);

  const baseResult = evaluate(model, draft.base, mode);
  const result = evaluateOverlay(model, draft.base, draft.overlay, mode);
  const { deltas } = diffResults(model, baseResult, result);

  if (!validate) {
    return { draft, result, deltas };
  }

  // Run validation: input schemas + overlay schemas + evaluation (derived + constraints)
  const inputValidation = validateFacts(model, draft.base, validationContext);
  const overlayValidation = validateOverlay(model, draft.overlay, validationContext);
  const evalValidation = validateEvaluation(model, result, validationContext);

  return mapAll(
    [inputValidation, overlayValidation, evalValidation],
    ([input, overlay, evaluation]) => {
      const merged = mergeResults(input, overlay, evaluation);
      return { draft, result, deltas, validation: merged };
    },
  );
}

function resolveOptions(modeOrOptions?: EvaluateMode | EvaluateDraftOptions): {
  mode: EvaluateMode;
  validate: boolean;
  validationContext?: ValidationContext;
} {
  if (typeof modeOrOptions === "string") {
    return { mode: modeOrOptions, validate: false };
  }
  return {
    mode: modeOrOptions?.mode ?? defaultEvaluateMode,
    validate: modeOrOptions?.validate ?? false,
    validationContext: modeOrOptions?.validationContext,
  };
}
