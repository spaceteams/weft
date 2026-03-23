import type { Key } from "../key";
import type { Divisible } from "../semantics/algebra";
import { type Rule, rule } from ".";

export function ratio<T, R>(
  ops: Divisible<T, R>,
  target: Key<R>,
  numerator: Key<T>,
  denominator: Key<T>,
): Rule<R> {
  return rule({
    target,
    deps: [numerator, denominator],
    eval: (get) => ops.div(get(numerator), get(denominator)),
  });
}
