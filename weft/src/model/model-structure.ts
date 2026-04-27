import type { KeyId } from "../key";
import type { KeyMeta } from "../key-meta";
import type { RuleMeta } from "../rule/rule-meta";

/**
 * The structural subset of a compiled model that enables graph traversal,
 * impact analysis, and inspection without the live rule functions.
 *
 * Both {@link CompiledModel} and hydrated frozen models satisfy this interface
 * via TypeScript structural typing — no explicit `extends` required.
 */
export type ModelStructure = {
  readonly inputKeys: readonly KeyId[];
  readonly orderedRuleTargets: readonly KeyId[];
  readonly depsByTarget: ReadonlyMap<KeyId, readonly KeyId[]>;
  readonly dependentsByKey: ReadonlyMap<KeyId, readonly KeyId[]>;
  readonly keyMeta: ReadonlyMap<KeyId, KeyMeta>;
  readonly ruleMeta: ReadonlyMap<KeyId, RuleMeta>;
  /**
   * Optional map from rule target to its spec object.
   * Enables {@link inspectModelTarget} on hydrated frozen models.
   */
  readonly ruleSpecs?: ReadonlyMap<KeyId, Record<string, unknown>>;
};
