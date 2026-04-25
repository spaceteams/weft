import { mapToFactBag } from "../facts";
import type { CompiledModel } from "../model";
import { snapshotModel } from "../model/snapshot-model";
import type { ExplainedDependency } from "../overlay/explain-diff";
import type { CanonicalJson } from "../snapshot/canonicalize";
import { type CanonicalDelta, canonicalizeDelta } from "../snapshot/canonicalizeDelta";
import { canonicalizeFacts } from "../snapshot/canonicalizeFacts";
import { fingerprintValue } from "../snapshot/fingerprint";
import type { DraftAnalysis, ImpactAnalysis, NormalizationIssue } from "./analyze-draft";

// ---------------------------------------------------------------------------
// Frozen (serializable) analysis
// ---------------------------------------------------------------------------

type AnalysisSnapshot = {
  modelFingerprint: string;
  baseFingerprint: string;
  overlayFingerprint: string;
  analysisFingerprint: string;
  createdAt: string;
};

export type FrozenDraftAnalysis = {
  draftId: string;
  snapshot: AnalysisSnapshot;
  base: Record<string, CanonicalJson>;
  overlay: Record<string, CanonicalJson>;
  effective: Record<string, CanonicalJson>;
  values: Record<string, CanonicalJson>;
  deltas: CanonicalDelta[];
  groupedDiffs: {
    label: string;
    deltas: CanonicalDelta[];
  }[];
  changes: {
    delta: CanonicalDelta;
    dependencies: readonly ExplainedDependency[] | undefined;
  }[];
  impact: ImpactAnalysis;
  normalizationIssues: readonly NormalizationIssue[];
  frozenAt: string;
};

/**
 * Serialize a {@link DraftAnalysis} into a fully canonical, fingerprinted
 * {@link FrozenDraftAnalysis} suitable for persistence or transport.
 *
 * All values are converted to {@link CanonicalJson} using the model's
 * semantic codecs, and the snapshot includes content-hash fingerprints
 * for cache-invalidation.
 */
export function freezeDraftAnalysis(
  model: CompiledModel,
  analysis: DraftAnalysis,
): FrozenDraftAnalysis {
  const modelShape = snapshotModel(model);
  const draft = analysis.evaluated.draft;
  const now = new Date().toISOString();
  const snapshot: AnalysisSnapshot = {
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

  return {
    draftId: draft.draftId,
    snapshot,

    base: canonicalizeFacts(model, draft.base),
    overlay: canonicalizeFacts(model, draft.overlay),
    effective: canonicalizeFacts(model, analysis.evaluated.result.overlayedFacts.effective),

    values: canonicalizeFacts(model, mapToFactBag(analysis.evaluated.result.values)),

    deltas: analysis.evaluated.deltas.map((delta) => canonicalizeDelta(model, delta)),
    groupedDiffs: analysis.groupedDiffs.map((group) => ({
      label: group.label,
      deltas: group.deltas.map((delta) => canonicalizeDelta(model, delta)),
    })),
    changes: analysis.changes.map((change) => ({
      delta: canonicalizeDelta(model, change.delta),
      dependencies: change.dependencies,
    })),
    impact: analysis.impact,
    normalizationIssues: analysis.normalizationIssues,

    frozenAt: now,
  };
}
