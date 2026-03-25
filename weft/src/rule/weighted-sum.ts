import type { Key, KeyId } from "../key";
import type { Additive, Scalable } from "../semantics/algebra";
import { type Rule, rule } from ".";

export type WeightedSumTraceDetail<S> = {
  op: "weighted-sum";
  deps: readonly KeyId[];
  weights: readonly S[];
};

export function weightedSum<T, S>(
  ops: Additive<T> & Scalable<T, S>,
  target: Key<T>,
  deps: readonly { key: Key<T>; weight: S }[],
): Rule<T> {
  return rule({
    target,
    deps: deps.map((d) => d.key),
    eval: (get) => {
      const output = deps.reduce(
        (acc, b) => ops.add(acc, ops.scale(get(b.key), b.weight)),
        ops.zero(),
      );
      const detail: WeightedSumTraceDetail<S> = {
        op: "weighted-sum",
        deps: deps.map((d) => d.key.id),
        weights: deps.map((d) => d.weight),
      };
      return { output, detail };
    },
  });
}
