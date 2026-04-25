import type { KeyId } from "../key";
import type { CompiledModel } from "../model";
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

/**
 * Normalize a draft by removing no-op overrides and validating overlay keys.
 *
 * - Keys that are not declared as model inputs are dropped (with a warning).
 * - Overlay values that are equal to their base value (after optional
 *   semantic normalization) are stripped so they don't produce spurious diffs.
 */
export function normalizeDraft(model: CompiledModel, draft: Draft): NormalizedDraft {
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

  return { draft: normalized, issues };
}
