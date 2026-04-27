import type { FrozenModel } from "../../model/freeze-model";
import { hydrateModel } from "../../model/freeze-model";
import type { DiffGroup } from "../../overlay/diff-group";
import { groupDiffByOrigin } from "../../overlay/diff-group";
import { deriveOrigins } from "../../overlay/evaluate-overlay";
import type { Change } from "../../overlay/explain-diff";
import { explainDiffs } from "../../overlay/explain-diff";
import type { CanonicalJson } from "../../snapshot/canonicalize";
import type { CanonicalDelta } from "../../snapshot/canonicalizeDelta";
import type { FrozenEvaluatedDraft } from "../freeze/freeze-evaluated-draft";
import { analyzeImpact, type ImpactAnalysis } from "./analyze-impact";

// ---------------------------------------------------------------------------
// ClientDraftAnalysis — the result of client-side analysis from frozen data
// ---------------------------------------------------------------------------

/**
 * The result of analyzing a frozen draft on the client side.
 *
 * Contains the same analytical dimensions as {@link DraftAnalysis} (impact,
 * grouped diffs, explained changes) but derived entirely from frozen/canonical
 * data without requiring a live {@link CompiledModel}.
 *
 * Excludes `evaluated` (requires live evaluation) and `normalizationIssues`
 * (requires live model validation).
 */
export type ClientDraftAnalysis = {
  readonly impact: ImpactAnalysis;
  readonly groupedDiffs: readonly DiffGroup<CanonicalDelta>[];
  readonly changes: readonly Change<CanonicalDelta>[];
  readonly values: Record<string, CanonicalJson>;
};

// ---------------------------------------------------------------------------
// analyzeFrozenDraft — one-call client-side analysis
// ---------------------------------------------------------------------------

/**
 * Reconstruct a full draft analysis from frozen artifacts — no live model needed.
 *
 * This is the client-side equivalent of {@link analyzeDraft}. Given a
 * {@link FrozenModel} and {@link FrozenEvaluatedDraft} (both JSON-safe),
 * it hydrates the model structure, derives origins, and produces impact
 * analysis, diff grouping, and change explanation in a single call.
 *
 * @example
 * ```ts
 * // Server sends frozen data over the wire
 * const frozenModel = await fetch("/api/model").then(r => r.json());
 * const frozenDraft = await fetch("/api/draft/123").then(r => r.json());
 *
 * // Client reconstructs analysis without a round-trip
 * const { impact, groupedDiffs, changes, values } = analyzeFrozenDraft(frozenModel, frozenDraft);
 * ```
 */
export function analyzeFrozenDraft(
  frozenModel: FrozenModel,
  frozenDraft: FrozenEvaluatedDraft,
): ClientDraftAnalysis {
  const structure = hydrateModel(frozenModel);
  const origins = deriveOrigins(structure, Object.keys(frozenDraft.overlay));

  const impact = analyzeImpact(structure, origins, frozenDraft.deltas);
  const groupedDiffs = groupDiffByOrigin({ origins }, frozenDraft.deltas);
  const changes = explainDiffs({ trace: frozenDraft.trace }, frozenDraft.deltas);

  return { impact, groupedDiffs, changes, values: frozenDraft.values };
}
