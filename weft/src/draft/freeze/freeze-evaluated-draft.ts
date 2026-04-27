import { mapToFactBag } from "../../facts";
import type { CompiledModel } from "../../model";
import { snapshotModel } from "../../model/snapshot-model";
import type { CanonicalJson } from "../../snapshot/canonicalize";
import { type CanonicalDelta, canonicalizeDelta } from "../../snapshot/canonicalizeDelta";
import { canonicalizeFacts } from "../../snapshot/canonicalizeFacts";
import {
  type CanonicalTraceStep,
  canonicalizeTraceStep,
} from "../../snapshot/canonicalizeTraceStep";
import { fingerprintValue } from "../../snapshot/fingerprint";
import type { EvaluatedDraft } from "../evaluate-draft";
import { CURRENT_FROZEN_VERSION } from "./version";

// ---------------------------------------------------------------------------
// Snapshot — shared fingerprint envelope for all freeze levels
// ---------------------------------------------------------------------------

export type FrozenSnapshot = {
  readonly modelFingerprint: string;
  readonly baseFingerprint: string;
  readonly overlayFingerprint: string;
  readonly analysisFingerprint: string;
  readonly createdAt: string;
};

export function createFrozenSnapshot(
  model: CompiledModel,
  evaluated: EvaluatedDraft,
): FrozenSnapshot {
  const modelShape = snapshotModel(model);
  const draft = evaluated.draft;
  const now = new Date().toISOString();
  return {
    modelFingerprint: fingerprintValue(modelShape),
    baseFingerprint: fingerprintValue(draft.base),
    overlayFingerprint: fingerprintValue(draft.overlay),
    analysisFingerprint: fingerprintValue({
      model: modelShape,
      base: draft.base,
      overlay: draft.overlay,
    }),
    createdAt: now,
  };
}

// ---------------------------------------------------------------------------
// FrozenEvaluatedDraft — the canonical frozen artifact
//
// Contains canonical values, deltas, trace, and input facts.
// All higher-level analysis (impact, grouping, explanation) can be derived
// from this artifact combined with a FrozenModel.
// ---------------------------------------------------------------------------

export type FrozenEvaluatedDraft = {
  readonly version: number;
  readonly draftId: string;
  readonly snapshot: FrozenSnapshot;
  readonly base: Record<string, CanonicalJson>;
  readonly overlay: Record<string, CanonicalJson>;
  readonly effective: Record<string, CanonicalJson>;
  readonly values: Record<string, CanonicalJson>;
  readonly deltas: CanonicalDelta[];
  readonly trace: readonly CanonicalTraceStep[];
  readonly frozenAt: string;
};

/**
 * Serialize an {@link EvaluatedDraft} into a canonical, fingerprinted
 * {@link FrozenEvaluatedDraft} suitable for persistence or transport.
 *
 * Combine with a {@link FrozenModel} on the client to derive full analysis
 * (impact, diff grouping, explanation) without server round-trips.
 */
export function freezeEvaluatedDraft(
  model: CompiledModel,
  evaluated: EvaluatedDraft,
): FrozenEvaluatedDraft {
  const snapshot = createFrozenSnapshot(model, evaluated);
  const draft = evaluated.draft;

  return {
    version: CURRENT_FROZEN_VERSION,
    draftId: draft.draftId,
    snapshot,

    base: canonicalizeFacts(model, draft.base),
    overlay: canonicalizeFacts(model, draft.overlay),
    effective: canonicalizeFacts(model, evaluated.result.overlayedFacts.effective),

    values: canonicalizeFacts(model, mapToFactBag(evaluated.result.values)),

    deltas: evaluated.deltas.map((delta) => canonicalizeDelta(model, delta)),

    trace: evaluated.result.trace.map((step) => canonicalizeTraceStep(model, step)),

    frozenAt: snapshot.createdAt,
  };
}
