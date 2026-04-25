/**
 * Draft lifecycle — the central concept of weft.
 *
 * A Draft bundles a base fact set with an overlay of proposed changes.
 * Operations on a draft form a ladder from simple to comprehensive:
 *
 *   createDraft(...)          → Draft              (construct)
 *   isEmptyDraft(...)         → boolean            (check for changes)
 *   normalizeDraft(...)       → NormalizedDraft     (validate & clean)
 *   evaluateDraft(...)        → EvaluatedDraft      (run the model)
 *   analyzeImpact(...)        → ImpactAnalysis      (what changed?)
 *   analyzeDraft(...)         → DraftAnalysis       (full analysis with grouping & explanation)
 *   freezeDraftAnalysis(...)  → FrozenDraftAnalysis  (serialize for persistence)
 *
 * Use the level that matches your needs — you don't have to go all the way
 * to `analyzeDraft` if all you need is evaluation and impact.
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

export * from "./analyze-draft";
export * from "./analyze-impact";
export * from "./draft-meta";
export * from "./evaluate-draft";
export * from "./freeze-draft-analysis";
export * from "./normalize-draft";
