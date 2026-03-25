import type { EvaluationResult } from "../evaluate/evaluation-result";
import { getDeclaredKeys } from "../explain/model";
import type { KeyId } from "../key";
import type { CompiledModel } from "../model";

export type ValueDelta =
  | { readonly key: KeyId; readonly kind: "added"; readonly after: unknown }
  | { readonly key: KeyId; readonly kind: "removed"; readonly before: unknown }
  | {
      readonly key: KeyId;
      readonly kind: "changed";
      readonly before: unknown;
      readonly after: unknown;
    };

export function diffResults(
  model: CompiledModel,
  before: EvaluationResult,
  after: EvaluationResult,
): { deltas: readonly ValueDelta[] } {
  const deltas: ValueDelta[] = [];

  for (const key of getDeclaredKeys(model)) {
    const hasBefore = before.values.has(key);
    const hasAfter = after.values.has(key);

    if (!hasBefore && !hasAfter) continue;

    if (hasBefore !== hasAfter) {
      deltas.push(
        hasBefore
          ? { key, kind: "removed", before: before.values.get(key) }
          : { key, kind: "added", after: after.values.get(key) },
      );
      continue;
    }

    const beforeValue = before.values.get(key);
    const afterValue = after.values.get(key);
    const eq = model.keys.get(key)?.semantics?.eq ?? Object.is;

    if (!eq(beforeValue, afterValue)) {
      deltas.push({ key, kind: "changed", before: beforeValue, after: afterValue });
    }
  }

  return { deltas };
}
