import type { Key, KeyId } from "../key";
import type { Additive, OpsDescriptor, Scalable } from "../semantics/algebra";
import { type Rule, rule } from ".";
import { type Operand, resolveOperand } from "./operand";

export type WeightedSumSpec = {
  op: "weighted-sum";
  opsDescriptor: OpsDescriptor;
  deps: readonly KeyId[];
  weights: readonly unknown[];
};

export function weightedSum<T, S>(
  ops: OpsDescriptor & Additive<T> & Scalable<T, S>,
  target: Key<T>,
  deps: readonly { key: Key<T>; weight: Operand<S> }[],
): Rule<T> {
  const spec: WeightedSumSpec = {
    op: "weighted-sum",
    opsDescriptor: { family: ops.family, version: ops.version },
    deps: deps.map((d) => d.key.id),
    weights: deps.map((d) => d.weight),
  };
  return rule({
    target,
    spec,
    deps: deps.map((d) => d.key),
    eval: (get) => {
      const output = deps.reduce((acc, { key, weight }) => {
        const factor = resolveOperand(weight, get);
        const value = get(key);
        return ops.add(acc, ops.scale(value, factor));
      }, ops.zero());
      return { output };
    },
  });
}
