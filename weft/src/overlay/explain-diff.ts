import type { TraceStep } from "../evaluate/trace-step";
import type { KeyId } from "../key";
import type { ValueDelta } from "./diff-results";

export type ExplainedDependency = {
  readonly key: KeyId;
  readonly label?: string;
  readonly kind?: string;
  readonly changed: boolean;
};

export type Change<D = ValueDelta> = {
  readonly delta: D;
  readonly dependencies?: readonly ExplainedDependency[];
};

/**
 * Explain each delta by resolving its trace dependencies and marking which
 * ones also changed.
 *
 * Accepts any object carrying a `trace` — works with both live
 * {@link OverlayEvaluationResult} and frozen artifacts that have a
 * compatible trace array.
 */
export function explainDiffs<D extends { readonly key: KeyId } = ValueDelta>(
  result: { readonly trace: readonly TraceStep[] },
  deltas: readonly D[],
): readonly Change<D>[] {
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
