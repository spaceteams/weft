import { defaultEvaluateMode, type EvaluateMode } from "../../evaluate";
import type { MaybeAsync } from "../../maybe-async";
import { thenMaybe } from "../../maybe-async";
import type { CompiledModel } from "../../model";
import type { DiffGroup } from "../../overlay/diff-group";
import { groupDiffByOrigin } from "../../overlay/diff-group";
import { type Change, explainDiffs } from "../../overlay/explain-diff";
import type { ValidationContext } from "../../validate/validation-context";
import type { ValidationResult } from "../../validate/validation-result";
import type { Draft } from "..";
import { type EvaluatedDraft, evaluateDraft } from "../evaluate-draft";
import type { NormalizationIssue } from "../normalize-draft";
import { normalizeDraft } from "../normalize-draft";
import { analyzeImpact, type ImpactAnalysis } from "./analyze-impact";

// ---------------------------------------------------------------------------
// DraftAnalysis — the rich, live result of a full analysis
// ---------------------------------------------------------------------------

export type DraftAnalysis = {
  readonly evaluated: EvaluatedDraft;
  readonly groupedDiffs: readonly DiffGroup[];
  readonly changes: readonly Change[];
  readonly impact: ImpactAnalysis;
  readonly normalizationIssues: readonly NormalizationIssue[];
  readonly validation?: ValidationResult;
};

export type AnalyzeOptions = {
  mode?: EvaluateMode;
  validate?: boolean;
  validationContext?: ValidationContext;
};

/**
 * Full draft analysis: normalize → evaluate → impact-analyze → group diffs → explain changes.
 *
 * Returns a rich {@link DraftAnalysis} with live objects suitable for
 * inspection, UI rendering, and further programmatic use.
 *
 * When `options.validate` is true, runs schema validation on inputs, overlay,
 * and derived values. Validation issues are included in the result but never
 * abort the analysis — the pipeline always completes.
 *
 * For the frozen/transport path, use {@link freezeEvaluatedDraft} +
 * {@link freezeModel} and derive analysis on the client.
 */
export function analyzeDraft(
  model: CompiledModel,
  draft: Draft,
  mode?: EvaluateMode,
): DraftAnalysis;
export function analyzeDraft(
  model: CompiledModel,
  draft: Draft,
  options: AnalyzeOptions,
): MaybeAsync<DraftAnalysis>;
export function analyzeDraft(
  model: CompiledModel,
  draft: Draft,
  modeOrOptions?: EvaluateMode | AnalyzeOptions,
): MaybeAsync<DraftAnalysis> {
  const { mode, validate, validationContext } = resolveAnalyzeOptions(modeOrOptions);

  if (validate) {
    return thenMaybe(normalizeDraft(model, draft, { validate, validationContext }), (normalized) =>
      thenMaybe(
        evaluateDraft(model, normalized.draft, { mode, validate: true, validationContext }),
        (evaluated) => buildAnalysis(model, evaluated, normalized.issues),
      ),
    );
  }

  const normalizeResult = normalizeDraft(model, draft);
  return buildAnalysis(
    model,
    evaluateDraft(model, normalizeResult.draft, mode),
    normalizeResult.issues,
  );
}

function buildAnalysis(
  model: CompiledModel,
  evaluated: EvaluatedDraft,
  normalizationIssues: readonly NormalizationIssue[],
): DraftAnalysis {
  const impact = analyzeImpact(model, evaluated.result.origins, evaluated.deltas);
  const groupedDiffs = groupDiffByOrigin(evaluated.result, evaluated.deltas);
  const changes = explainDiffs(evaluated.result, evaluated.deltas);

  return {
    evaluated,
    groupedDiffs,
    changes,
    impact,
    normalizationIssues,
    validation: evaluated.validation,
  };
}

function resolveAnalyzeOptions(modeOrOptions?: EvaluateMode | AnalyzeOptions): {
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
