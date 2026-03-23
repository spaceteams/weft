import type { Key } from "../key";
import type { Additive } from "../semantics/algebra";
import { type Rule, rule } from ".";

export function sum<T>(ops: Additive<T>, target: Key<T>, deps: readonly Key<T>[]): Rule<T> {
  return rule({
    target,
    deps,
    eval: (get) => deps.reduce((acc, b) => ops.add(acc, get(b)), ops.zero()),
  });
}
