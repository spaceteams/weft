import type { Key, KeyId } from "../key";
import type { Additive, OpsDescriptor } from "../semantics/algebra";
import { type Rule, rule } from ".";

export type NegateSpec = {
  op: "negate";
  opsDescriptor: OpsDescriptor;
  source: KeyId;
};

export function negate<T>(
  ops: OpsDescriptor & Additive<T>,
  target: Key<T>,
  source: Key<T>,
): Rule<T> {
  const spec: NegateSpec = {
    op: "negate",
    opsDescriptor: { family: ops.family, version: ops.version },
    source: source.id,
  };
  return rule({
    target,
    spec,
    deps: [source],
    eval: (get) => {
      const output = ops.sub(ops.zero(), get(source));
      return { output };
    },
  });
}
