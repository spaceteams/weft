import type { Key, KeyId } from "../key";
import type { Divisible } from "../semantics/algebra";
import { type Rule, rule } from ".";

export type RatioTraceDetail = {
  op: "ratio";
  numerator: KeyId;
  denominator: KeyId;
};
export function ratio<T, R>(
  ops: Divisible<T, R>,
  target: Key<R>,
  numerator: Key<T>,
  denominator: Key<T>,
): Rule<R> {
  return rule({
    target,
    deps: [numerator, denominator],
    eval: (get) => {
      const output = ops.div(get(numerator), get(denominator));
      const detail: RatioTraceDetail = {
        op: "ratio",
        numerator: numerator.id,
        denominator: denominator.id,
      };
      return { output, detail };
    },
  });
}
