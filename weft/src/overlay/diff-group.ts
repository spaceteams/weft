import type { KeyId } from "../key";
import type { ModelStructure } from "../model/model-structure";
import type { ValueDelta } from "./diff-results";
import type { OriginMap } from "./evaluate-overlay";

export type DiffGroup<D = ValueDelta> = {
  readonly label: string;
  readonly deltas: readonly D[];
};

export type GroupedDiff<D = ValueDelta> = readonly DiffGroup<D>[];

/**
 * Group deltas by their origin (overlay input vs derived).
 *
 * Accepts any object carrying an {@link OriginMap} — works with both live
 * {@link OverlayEvaluationResult} and reconstructed origins from frozen data.
 */
export function groupDiffByOrigin<D extends { readonly key: KeyId } = ValueDelta>(
  result: { readonly origins: OriginMap },
  deltas: readonly D[],
): GroupedDiff<D> {
  const overlayInputs: D[] = [];
  const derivedValues: D[] = [];
  const other: D[] = [];

  for (const delta of deltas) {
    const origin = result.origins.get(delta.key);
    if (origin?.kind === "overlay") {
      overlayInputs.push(delta);
    } else if (origin?.kind === "derived") {
      derivedValues.push(delta);
    } else {
      other.push(delta);
    }
  }

  const groups: DiffGroup<D>[] = [];
  if (overlayInputs.length) {
    groups.push({ label: "Overlay inputs", deltas: overlayInputs });
  }
  if (derivedValues.length) {
    groups.push({ label: "Derived values", deltas: derivedValues });
  }
  if (other.length) {
    groups.push({ label: "Other", deltas: other });
  }
  return groups;
}

/**
 * Group deltas by their key's metadata `group` field.
 *
 * Accepts any object with a `keyMeta` map — works with both live
 * {@link CompiledModel} and hydrated frozen models.
 */
export function groupDiffByMetadataGroup<D extends { readonly key: KeyId } = ValueDelta>(
  model: Pick<ModelStructure, "keyMeta">,
  deltas: readonly D[],
): GroupedDiff<D> {
  const groups: Record<string, D[]> = {};

  for (const delta of deltas) {
    const meta = model.keyMeta.get(delta.key);
    const group = meta?.group ?? "Other";
    if (!groups[group]) {
      groups[group] = [];
    }
    groups[group].push(delta);
  }

  return Object.entries(groups).map(([label, deltas]) => ({ label, deltas }));
}
