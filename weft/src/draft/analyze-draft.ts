import { defaultEvaluateMode } from "../evaluate";
import { mapToFactBag } from "../facts";
import type { KeyId } from "../key";
import type { CompiledModel } from "../model";
import { snapshotModel } from "../model/snapshot-model";
import { type DiffGroup, type GroupedDiff, groupDiffByOrigin } from "../overlay/diff-group";
import { type Change, explainDiffs } from "../overlay/explain-diff";
import { canonicalizeDelta } from "../snapshot/canonicalizeDelta";
import { canonicalizeFacts } from "../snapshot/canonicalizeFacts";
import { fingerprintValue } from "../snapshot/fingerprint";
import type { Draft } from ".";
import { type EvaluatedDraft, evaluateDraft } from "./evaluate-draft";

export type ImpactAnalysis = {
  readonly direct: readonly KeyId[];
  readonly affected: readonly KeyId[];
  readonly terminal: readonly KeyId[];
};
export type DraftAnalysis = {
  readonly evaluated: EvaluatedDraft;
  readonly groupedDiffs: readonly DiffGroup[];
  readonly changes: readonly Change[];
  readonly impact: ImpactAnalysis;
  readonly normalizationIssues: readonly NormalizationIssue[];
};
export function analyzeDraft(
  model: CompiledModel,
  draft: Draft,
  mode = defaultEvaluateMode,
): DraftAnalysis {
  const normalized = normalizeDraft(model, draft);
  const evaluated = evaluateDraft(model, normalized.draft, mode);
  const impact = analyzeImpact(model, evaluated);
  const groupedDiffs = groupDiffByOrigin(evaluated.result, evaluated.deltas);
  const changes = explainDiffs(evaluated.result, evaluated.deltas);
  return {
    evaluated,
    groupedDiffs,
    changes,
    impact,
    normalizationIssues: normalized.issues,
  };
}

type NormalizationIssue = {
  level: "error" | "warning";
  key: KeyId;
  message: string;
};
type NormalizedDraft = {
  draft: Draft;
  issues: readonly NormalizationIssue[];
};

function normalizeDraft(model: CompiledModel, draft: Draft): NormalizedDraft {
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

function analyzeImpact(model: CompiledModel, evaluated: EvaluatedDraft): ImpactAnalysis {
  const changed = new Set(evaluated.deltas.map((d) => d.key));

  const direct: KeyId[] = [];
  const affected: KeyId[] = [];
  const terminal: KeyId[] = [];

  for (const key of changed) {
    const origin = evaluated.result.origins.get(key);
    if (origin?.kind === "overlay") {
      direct.push(key);
    } else if (origin?.kind === "derived") {
      affected.push(key);
    }
  }

  for (const key of changed) {
    const dependents = model.dependentsByKey.get(key);
    const hasChangedDependents = dependents?.some((d) => changed.has(d));

    if (!hasChangedDependents) {
      terminal.push(key);
    }
  }

  return { direct, affected, terminal };
}

type AnalysisSnapshot = {
  modelFingerprint: string;
  baseFingerprint: string;
  overlayFingerprint: string;
  analysisFingerprint: string;
  createdAt: string;
};

export type FreezeDraftAnalysisInput = {
  model: CompiledModel;
  draft: Draft;
  normalized: NormalizedDraft;
  evaluated: EvaluatedDraft;
  groupedDiffs: GroupedDiff;
  changes: readonly Change[];
  impact: ImpactAnalysis;
  now: string;
};

export function freezeDraftAnalysis(model: CompiledModel, analysis: DraftAnalysis) {
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

    base: canonicalizeFacts(model, draft.base) as Record<string, unknown>,
    overlay: canonicalizeFacts(model, draft.overlay) as Record<string, unknown>,
    effective: canonicalizeFacts(
      model,
      analysis.evaluated.result.overlayedFacts.effective,
    ) as Record<string, unknown>,

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
