import type { ModelStructure } from "../model/model-structure";
import type { ValueDelta } from "./diff-results";
import type { OriginMap } from "./evaluate-overlay";

export type DiffGroup = {
  readonly label: string;
  readonly deltas: readonly ValueDelta[];
};

export type GroupedDiff = readonly DiffGroup[];

/**
 * Group deltas by their origin (overlay input vs derived).
 *
 * Accepts any object carrying an {@link OriginMap} — works with both live
 * {@link OverlayEvaluationResult} and reconstructed origins from frozen data.
 */
export function groupDiffByOrigin(
  result: { readonly origins: OriginMap },
  deltas: readonly ValueDelta[],
): GroupedDiff {
  const overlayInputs: ValueDelta[] = [];
  const derivedValues: ValueDelta[] = [];
  const other: ValueDelta[] = [];

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

  const groups: DiffGroup[] = [];
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
export function groupDiffByMetadataGroup(
  model: Pick<ModelStructure, "keyMeta">,
  deltas: readonly ValueDelta[],
): GroupedDiff {
  const groups: Record<string, ValueDelta[]> = {};

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
