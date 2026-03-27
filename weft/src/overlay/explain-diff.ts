import type { KeyId } from "../key";
import type { ValueDelta } from "./diff-results";
import type { OverlayEvaluationResult } from "./evaluate-overlay";

export type ExplainedDependency = {
  readonly key: KeyId;
  readonly label?: string;
  readonly kind?: string;
  readonly changed: boolean;
};

export type Change = {
  readonly delta: ValueDelta;
  readonly dependencies?: readonly ExplainedDependency[];
};

export function explainDiffs(
  result: OverlayEvaluationResult,
  deltas: readonly ValueDelta[],
): readonly Change[] {
  const changedKeys = new Set(deltas.map((d) => d.key));
  const traceByTarget = new Map(result.trace.map((step) => [step.target, step]));

  return deltas.map((delta) => {
    const step = traceByTarget.get(delta.key);

    if (!step) {
      return {
        delta,
      };
    }

    const dependencies: ExplainedDependency[] = step.deps.map((depKey) => ({
      key: depKey,
      changed: changedKeys.has(depKey),
    }));

    return {
      delta,
      dependencies,
    };
  });
}
