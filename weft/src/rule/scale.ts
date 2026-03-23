import type { Key } from "../key";
import type { Scalable } from "../semantics/algebra";
import { type Rule, rule } from ".";

export function scale<T, S>(
  ops: Scalable<T, S>,
  target: Key<T>,
  value: Key<T>,
  factor: Key<S>,
): Rule<T> {
  return rule({
    target,
    deps: [value, factor],
    eval: (get) => ops.scale(get(value), get(factor)),
  });
}
