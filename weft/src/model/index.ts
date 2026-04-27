import type { Input } from "../input";
import type { AnyKey, KeyId, KeySemantics } from "../key";
import type { KeyMeta } from "../key-meta";
import type { Rule } from "../rule";
import type { RuleMeta } from "../rule/rule-meta";

export type Model = {
  readonly inputs: readonly Input<unknown>[];
  readonly rules: readonly Rule<unknown>[];
  readonly semantics: ReadonlyMap<KeyId, Partial<KeySemantics<unknown>>>;
  readonly keyMeta: ReadonlyMap<KeyId, KeyMeta>;
  readonly ruleMeta: ReadonlyMap<KeyId, RuleMeta>;
};

export type CompiledModel = Model & {
  readonly keys: ReadonlyMap<KeyId, AnyKey>;
  readonly semantics: ReadonlyMap<KeyId, Partial<KeySemantics<unknown>>>;
  readonly inputKeys: readonly KeyId[];
  readonly orderedRuleTargets: readonly KeyId[];
  readonly ruleByTarget: ReadonlyMap<KeyId, Rule<unknown>>;
  readonly depsByTarget: ReadonlyMap<KeyId, readonly KeyId[]>;
  readonly dependentsByKey: ReadonlyMap<KeyId, readonly KeyId[]>;
};

export * from "./compile-model";
export * from "./create-model";
export * from "./freeze-model";
export * from "./model";
export * from "./model-graph";
export * from "./model-structure";
export * from "./snapshot-model";
