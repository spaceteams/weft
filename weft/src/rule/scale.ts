import type { Key, KeyId } from "../key";
import type { Scalable } from "../semantics/algebra";
import { type Rule, rule } from ".";

export type ScaleTraceDetail = {
  op: "scale";
  input: KeyId;
  factor: KeyId;
};
export function scale<T, S>(
  ops: Scalable<T, S>,
  target: Key<T>,
  input: Key<T>,
  factor: Key<S>,
): Rule<T> {
  return rule({
    target,
    deps: [input, factor],
    eval: (get) => {
      const output = ops.scale(get(input), get(factor));
      const detail: ScaleTraceDetail = {
        op: "scale",
        input: input.id,
        factor: factor.id,
      };
      return { output, detail };
    },
  });
}
