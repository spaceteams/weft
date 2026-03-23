import type { Key } from "../key";
import type { Additive, Scalable } from "../semantics/algebra";
import { type Rule, rule } from ".";

export function weightedSum<T, S>(
  ops: Additive<T> & Scalable<T, S>,
  target: Key<T>,
  deps: readonly { key: Key<T>; weight: S }[],
): Rule<T> {
  return rule({
    target,
    deps: deps.map((d) => d.key),
    eval: (get) =>
      deps.reduce((acc, b) => ops.add(acc, ops.scale(get(b.key), b.weight)), ops.zero()),
  });
}
