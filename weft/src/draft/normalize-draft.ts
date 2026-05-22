import type { KeyId } from "../key";
import { type MaybeAsync, mapAll } from "../maybe-async";
import type { CompiledModel } from "../model";
import { validateFacts } from "../validate/validate-facts";
import { validateOverlay } from "../validate/validate-overlay";
import type { ValidationContext } from "../validate/validation-context";
import type { ValidationResult } from "../validate/validation-result";
import type { Draft } from ".";

export type NormalizationIssue = {
  level: "error" | "warning";
  key: KeyId;
  message: string;
};

export type NormalizedDraft = {
  draft: Draft;
  issues: readonly NormalizationIssue[];
};

export type NormalizeOptions = {
  validate?: boolean;
  validationContext?: ValidationContext;
};

/**
 * Normalize a draft by removing no-op overrides and validating overlay keys.
 *
 * - Keys that are not declared as model inputs are dropped (with a warning).
 * - Overlay values that are equal to their base value (after optional
 *   semantic normalization) are stripped so they don't produce spurious diffs.
 * - When `options.validate` is true, schema validation runs on base and overlay
 *   values. Validation issues are appended to the returned issues list.
 */
export function normalizeDraft(model: CompiledModel, draft: Draft): NormalizedDraft;
export function normalizeDraft(
  model: CompiledModel,
  draft: Draft,
  options: NormalizeOptions,
): MaybeAsync<NormalizedDraft>;
export function normalizeDraft(
  model: CompiledModel,
  draft: Draft,
  options?: NormalizeOptions,
): MaybeAsync<NormalizedDraft> {
  const normalized: Draft = {
    draftId: draft.draftId,
    base: draft.base,
    overlay: {},
    meta: draft.meta,
  };
  const issues: NormalizationIssue[] = [];

  for (const key of Object.keys(draft.overlay)) {
    if (!model.inputKeys.includes(key)) {
      issues.push({
        level: "warning",
        key: key as KeyId,
        message: `Key "${key}" is not an input key and will be ignored`,
      });
      continue;
    }
    const base = draft.base[key];
    let overlay = draft.overlay[key];
    const semantics = model.semantics.get(key);
    const normalize = semantics?.normalize;
    if (normalize) {
      overlay = normalize(overlay);
    }
    const eq = semantics?.eq ?? Object.is;
    if (eq(base, overlay)) {
      continue;
    }
    normalized.overlay[key] = overlay;
  }

  if (!options?.validate) {
    return { draft: normalized, issues };
  }

  // Run schema validation on base facts and overlay
  const baseValidation = validateFacts(model, draft.base, options.validationContext);
  const overlayValidation = validateOverlay(model, draft.overlay, options.validationContext);

  return mapAll([baseValidation, overlayValidation], ([base, overlay]) => {
    appendValidationIssues(issues, base);
    appendValidationIssues(issues, overlay);
    return { draft: normalized, issues };
  });
}

function appendValidationIssues(issues: NormalizationIssue[], validation: ValidationResult): void {
  for (const issue of validation.issues) {
    issues.push({
      level: issue.severity === "info" ? "warning" : issue.severity,
      key: issue.key,
      message: issue.message,
    });
  }
}
