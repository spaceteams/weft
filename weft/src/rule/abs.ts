import type { Key, KeyId } from "../key";
import type { Additive, OpsDescriptor, Order } from "../semantics/algebra";
import { type Rule, rule } from ".";

export type AbsSpec = {
  op: "abs";
  opsDescriptor: OpsDescriptor;
  source: KeyId;
};

export function abs<T>(
  ops: OpsDescriptor & Order<T> & Additive<T>,
  target: Key<T>,
  source: Key<T>,
): Rule<T> {
  const spec: AbsSpec = {
    op: "abs",
    opsDescriptor: { family: ops.family, version: ops.version },
    source: source.id,
  };
  return rule({
    target,
    spec,
    deps: [source],
    eval: (get) => {
      const v = get(source);
      const output = ops.compare(v, ops.zero()) < 0 ? ops.sub(ops.zero(), v) : v;
      return { output };
    },
  });
}
