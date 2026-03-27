import { type Input, input } from "../input";
import type { Key, KeyId, KeySemantics } from "../key";
import type { KeyMeta } from "../key-meta";
import type { Rule } from "../rule";
import type { RuleMeta } from "../rule/rule-meta";
import type { Model } from ".";

export function createModel() {
  const inputs: Input<unknown>[] = [];
  const rules: Rule<unknown>[] = [];
  const keyMeta: Map<KeyId, KeyMeta> = new Map();
  const ruleMeta: Map<KeyId, RuleMeta> = new Map();
  const semanticsMap: Map<KeyId, Partial<KeySemantics<unknown>>> = new Map();
  return {
    input<T>(k: Key<T>, meta: KeyMeta = {}, semantics?: Partial<KeySemantics<T>>): Key<T> {
      inputs.push(input(k));
      keyMeta.set(k.id, meta);
      if (semantics) {
        semanticsMap.set(k.id, semantics as Partial<KeySemantics<unknown>>);
      }
      return k;
    },
    rule<T>(r: Rule<T>, meta: RuleMeta = {}, semantics?: Partial<KeySemantics<T>>): Key<T> {
      rules.push(r);
      ruleMeta.set(r.target.id, meta);
      if (semantics) {
        semanticsMap.set(r.target.id, semantics as Partial<KeySemantics<unknown>>);
      }
      return r.target;
    },
    build(): Model {
      return { inputs, rules, semantics: semanticsMap, keyMeta, ruleMeta };
    },
  };
}
