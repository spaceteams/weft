/**
 * Draft lifecycle — the central concept of weft.
 *
 * A Draft bundles a base fact set with an overlay of proposed changes.
 * Operations on a draft form a pipeline:
 *
 *   createDraft(...)             → Draft                (construct)
 *   isEmptyDraft(...)            → boolean              (check for changes)
 *   normalizeDraft(...)          → NormalizedDraft       (validate & clean)
 *   evaluateDraft(...)           → EvaluatedDraft        (run the model)
 *   analyzeImpact(...)           → ImpactAnalysis        (what changed?)
 *   analyzeDraft(...)            → DraftAnalysis         (full analysis)
 *
 * Freeze for transport:
 *
 *   freezeEvaluatedDraft(...)    → FrozenEvaluatedDraft  (values + deltas + trace)
 *   freezeModel(...)             → FrozenModel           (structural model data)
 *
 * On the client, hydrate and derive:
 *
 *   hydrateModel(frozen)         → ModelStructure
 *   deriveOrigins(model, keys)   → OriginMap
 *   analyzeImpact / groupDiffByOrigin / explainDiffs — all work on frozen data
 */
import type { FactBag } from "../facts";
import type { Overlay } from "../overlay";
import type { DraftMeta } from "./draft-meta";

export type DraftId = string;

export type Draft = {
  readonly draftId: DraftId;
  readonly base: FactBag;
  readonly overlay: Overlay;
  readonly meta?: DraftMeta;
};

export function createDraft(draftId: DraftId, base: FactBag, overlay: Overlay): Draft {
  return { draftId, base, overlay };
}

export function isEmptyDraft(draft: Draft) {
  return Object.keys(draft.overlay).length === 0;
}

export * from "./analysis";
export * from "./draft-meta";
export * from "./evaluate-draft";
export * from "./freeze";
export * from "./normalize-draft";
