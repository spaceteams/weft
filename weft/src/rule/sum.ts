import type { Key, KeyId } from "../key";
import type { Additive, OpsDescriptor } from "../semantics/algebra";
import { type Rule, rule } from ".";

export type SumTraceSpec = {
  op: "sum";
  opsDescriptor: OpsDescriptor;
  deps: readonly KeyId[];
};
export function sum<T>(
  ops: OpsDescriptor & Additive<T>,
  target: Key<T>,
  deps: readonly Key<T>[],
): Rule<T> {
  const spec: SumTraceSpec = {
    op: "sum",
    opsDescriptor: {
      family: ops.family,
      version: ops.version,
    },
    deps: deps.map((d) => d.id),
  };
  return rule({
    target,
    spec,
    deps,
    eval: (get) => {
      const output = deps.reduce((acc, b) => ops.add(acc, get(b)), ops.zero());
      return { output };
    },
  });
}
