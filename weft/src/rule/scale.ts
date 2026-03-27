import type { Key, KeyId } from "../key";
import type { OpsDescriptor, Scalable } from "../semantics/algebra";
import { type Rule, rule } from ".";

export type ScaleTraceSpec = {
  op: "scale";
  opsDescriptor: OpsDescriptor;
  input: KeyId;
  factor: KeyId;
};
export function scale<T, S>(
  ops: OpsDescriptor & Scalable<T, S>,
  target: Key<T>,
  input: Key<T>,
  factor: Key<S>,
): Rule<T> {
  const spec: ScaleTraceSpec = {
    op: "scale",
    opsDescriptor: { family: ops.family, version: ops.version },
    input: input.id,
    factor: factor.id,
  };
  return rule({
    target,
    spec,
    deps: [input, factor],
    eval: (get) => {
      const output = ops.scale(get(input), get(factor));
      return { output };
    },
  });
}
