import type { Input } from "../input";
import type { Key, KeyId } from "../key";
import type { KeyMeta } from "../key-meta";
import type { Rule } from "../rule";
import type { RuleMeta } from "../rule/rule-meta";

export type Model = {
  readonly inputs: readonly Input<unknown>[];
  readonly rules: readonly Rule<unknown>[];
  readonly keyMeta: ReadonlyMap<KeyId, KeyMeta>;
  readonly ruleMeta: ReadonlyMap<KeyId, RuleMeta>;
};

export type CompiledModel = Model & {
  readonly keys: ReadonlyMap<KeyId, Key<unknown>>;
  readonly inputKeys: readonly KeyId[];
  readonly orderedRuleTargets: readonly KeyId[];
  readonly ruleByTarget: ReadonlyMap<KeyId, Rule<unknown>>;
  readonly depsByTarget: ReadonlyMap<KeyId, readonly KeyId[]>;
  readonly dependentsByKey: ReadonlyMap<KeyId, readonly KeyId[]>;
};
