import type { Draft } from "../draft";
import { type MaybeAsync, mapAll } from "../maybe-async";
import type { CompiledModel } from "../model";
import { validateFacts } from "./validate-facts";
import { validateOverlay } from "./validate-overlay";
import type { ValidationContext } from "./validation-context";
import { mergeResults, type ValidationResult } from "./validation-result";

/**
 * Validates both `draft.base` (all input keys) and `draft.overlay` (overlay keys only).
 * Merges results from both validations.
 *
 * Returns synchronously if all schemas validate synchronously.
 */
export function validateDraft(
  model: CompiledModel,
  draft: Draft,
  context?: ValidationContext,
): MaybeAsync<ValidationResult> {
  const baseResult = validateFacts(model, draft.base, context);
  const overlayResult = validateOverlay(model, draft.overlay, context);

  return mapAll([baseResult, overlayResult], ([base, overlay]) => mergeResults(base, overlay));
}
