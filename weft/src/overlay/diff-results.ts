import type { EvaluationResult, LayerResults } from "../evaluate/evaluation-result";
import type { KeyId } from "../key";
import type { CompiledModel } from "../model";
import { getDeclaredKeys } from "../model/model";

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
): {
  deltas: readonly ValueDelta[];
  layerDeltas?: Readonly<Record<string, readonly ValueDelta[]>>;
} {
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
    const eq = model.semantics.get(key)?.eq ?? Object.is;

    if (!eq(beforeValue, afterValue)) {
      deltas.push({ key, kind: "changed", before: beforeValue, after: afterValue });
    }
  }

  const layerDeltas = diffLayerResults(model, before.layers, after.layers);

  return {
    deltas,
    ...(layerDeltas && { layerDeltas }),
  };
}

function layerValueEq(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object" || a === null || b === null) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function diffLayerResults(
  model: CompiledModel,
  before: LayerResults,
  after: LayerResults,
): Record<string, readonly ValueDelta[]> | undefined {
  if (before.size === 0 && after.size === 0) return undefined;

  const allLayerNames = new Set([...before.keys(), ...after.keys()]);
  const result: Record<string, ValueDelta[]> = {};
  let hasAny = false;

  for (const layerName of allLayerNames) {
    const beforeLayer = before.get(layerName) ?? new Map<KeyId, unknown>();
    const afterLayer = after.get(layerName) ?? new Map<KeyId, unknown>();

    const allKeys = new Set<KeyId>();
    for (const key of getDeclaredKeys(model)) {
      if (beforeLayer.has(key) || afterLayer.has(key)) {
        allKeys.add(key);
      }
    }

    const layerDeltas: ValueDelta[] = [];
    for (const key of allKeys) {
      const hasBefore = beforeLayer.has(key);
      const hasAfter = afterLayer.has(key);

      if (!hasBefore && !hasAfter) continue;

      if (hasBefore !== hasAfter) {
        layerDeltas.push(
          hasBefore
            ? { key, kind: "removed", before: beforeLayer.get(key) }
            : { key, kind: "added", after: afterLayer.get(key) },
        );
        continue;
      }

      const beforeValue = beforeLayer.get(key);
      const afterValue = afterLayer.get(key);
      if (!layerValueEq(beforeValue, afterValue)) {
        layerDeltas.push({ key, kind: "changed", before: beforeValue, after: afterValue });
      }
    }

    if (layerDeltas.length > 0) {
      result[layerName] = layerDeltas;
      hasAny = true;
    }
  }

  return hasAny ? result : undefined;
}
