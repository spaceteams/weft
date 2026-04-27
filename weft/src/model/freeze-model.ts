import type { KeyId } from "../key";
import type { KeyMeta } from "../key-meta";
import type { RuleMeta } from "../rule/rule-meta";
import { type CanonicalJson, canonicalize } from "../snapshot/canonicalize";
import type { CompiledModel } from ".";
import type { ModelStructure } from "./model-structure";

// ---------------------------------------------------------------------------
// FrozenModel — JSON-serializable representation of the model structure
// ---------------------------------------------------------------------------

/**
 * A JSON-serializable snapshot of a model's structural information.
 *
 * Contains everything needed to perform graph traversal, impact analysis,
 * diff grouping, and inspection on the client — without the live rule
 * functions or key semantics that require server-side code.
 *
 * Use {@link freezeModel} to create and {@link hydrateModel} to restore
 * a {@link ModelStructure} with proper Map instances.
 */
export type FrozenModel = {
  readonly inputKeys: readonly KeyId[];
  readonly orderedRuleTargets: readonly KeyId[];
  readonly depsByTarget: Readonly<Record<KeyId, readonly KeyId[]>>;
  readonly dependentsByKey: Readonly<Record<KeyId, readonly KeyId[]>>;
  readonly keyMeta: Readonly<Record<KeyId, KeyMeta>>;
  readonly ruleMeta: Readonly<Record<KeyId, RuleMeta>>;
  readonly ruleSpecs: Readonly<Record<KeyId, Record<string, CanonicalJson>>>;
};

/**
 * Serialize a {@link CompiledModel} into a {@link FrozenModel} suitable for
 * JSON serialization and transport to a frontend or worker.
 *
 * Rule specs are canonicalized (keys sorted, values normalized) to ensure
 * deterministic serialization and consistent fingerprinting.
 */
export function freezeModel(model: CompiledModel): FrozenModel {
  const ruleSpecs: Record<KeyId, Record<string, CanonicalJson>> = {};
  for (const [key, spec] of model.ruleSpecs) {
    const canonical: Record<string, CanonicalJson> = {};
    for (const [k, v] of Object.entries(spec)) {
      canonical[k] = canonicalize(v);
    }
    ruleSpecs[key] = canonical;
  }

  return {
    inputKeys: [...model.inputKeys],
    orderedRuleTargets: [...model.orderedRuleTargets],
    depsByTarget: Object.fromEntries(model.depsByTarget),
    dependentsByKey: Object.fromEntries(model.dependentsByKey),
    keyMeta: Object.fromEntries(model.keyMeta),
    ruleMeta: Object.fromEntries(model.ruleMeta),
    ruleSpecs,
  };
}

/**
 * Hydrate a {@link FrozenModel} back into a {@link ModelStructure} with
 * proper Map instances, ready for use with graph traversal, impact analysis,
 * and inspection functions.
 */
export function hydrateModel(frozen: FrozenModel): ModelStructure {
  return {
    inputKeys: frozen.inputKeys,
    orderedRuleTargets: frozen.orderedRuleTargets,
    depsByTarget: new Map(Object.entries(frozen.depsByTarget)),
    dependentsByKey: new Map(Object.entries(frozen.dependentsByKey)),
    keyMeta: new Map(Object.entries(frozen.keyMeta)),
    ruleMeta: new Map(Object.entries(frozen.ruleMeta)),
    ruleSpecs: new Map(Object.entries(frozen.ruleSpecs)),
  };
}
