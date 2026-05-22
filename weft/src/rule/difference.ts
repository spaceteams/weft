import type { Key, KeyId } from "../key";
import type { Additive, OpsDescriptor } from "../semantics/algebra";
import { type Rule, rule } from ".";

export type DifferenceSpec = {
  op: "difference";
  opsDescriptor: OpsDescriptor;
  minuend: KeyId;
  subtrahend: KeyId;
};

export function difference<T>(
  ops: OpsDescriptor & Additive<T>,
  target: Key<T>,
  minuend: Key<T>,
  subtrahend: Key<T>,
): Rule<T> {
  const spec: DifferenceSpec = {
    op: "difference",
    opsDescriptor: { family: ops.family, version: ops.version },
    minuend: minuend.id,
    subtrahend: subtrahend.id,
  };
  return rule({
    target,
    spec,
    deps: [minuend, subtrahend],
    eval: (get) => {
      const output = ops.sub(get(minuend), get(subtrahend));
      return { output };
    },
  });
}
