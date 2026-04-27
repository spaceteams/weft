import type { KeyId } from "../../key";
import type { ModelStructure } from "../../model/model-structure";

import type { OriginMap } from "../../overlay/evaluate-overlay";

export type ImpactAnalysis = {
  readonly direct: readonly KeyId[];
  readonly affected: readonly KeyId[];
  readonly terminal: readonly KeyId[];
};

/**
 * Classify the impact of a set of deltas given origin and dependency information.
 *
 * Returns three disjoint lists of changed keys:
 * - **direct** – overlay inputs that the user explicitly changed.
 * - **affected** – derived (computed) values that changed as a consequence.
 * - **terminal** – changed keys whose own dependents did *not* change
 *   (i.e. the "leaf" effects in the change graph).
 *
 * Works with both live evaluation results and frozen/hydrated artifacts.
 */
export function analyzeImpact(
  model: ModelStructure,
  origins: OriginMap,
  deltas: readonly { readonly key: KeyId }[],
): ImpactAnalysis {
  const changed = new Set(deltas.map((d) => d.key));

  const direct: KeyId[] = [];
  const affected: KeyId[] = [];
  const terminal: KeyId[] = [];

  for (const key of changed) {
    const origin = origins.get(key);
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
