import { type Input, input } from "../input";
import type { Key, KeyId } from "../key";
import type { KeyMeta } from "../key-meta";
import type { Rule } from "../rule";
import type { RuleMeta } from "../rule/rule-meta";
import type { Model } from ".";

export function createModel() {
  const inputs: Input<unknown>[] = [];
  const rules: Rule<unknown>[] = [];
  const keyMeta: Map<KeyId, KeyMeta> = new Map();
  const ruleMeta: Map<KeyId, RuleMeta> = new Map();
  return {
    input<T>(k: Key<T>, meta: KeyMeta = {}): Key<T> {
      inputs.push(input(k));
      keyMeta.set(k.id, meta);
      return k;
    },
    rule<T>(r: Rule<T>, meta: RuleMeta = {}): Key<T> {
      rules.push(r);
      ruleMeta.set(r.target.id, meta);
      return r.target;
    },
    build(): Model {
      return { inputs, rules, keyMeta, ruleMeta };
    },
  };
}
