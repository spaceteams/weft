import type { Key, KeyId } from "../key";
import type { OpsDescriptor, Scalable } from "../semantics/algebra";
import { type Rule, rule } from ".";

export type ProductSpec = {
  op: "product";
  opsDescriptor: OpsDescriptor;
  factors: readonly KeyId[];
};

export function product<T>(
  ops: OpsDescriptor & Scalable<T, T>,
  target: Key<T>,
  factors: readonly Key<T>[],
): Rule<T> {
  const spec: ProductSpec = {
    op: "product",
    opsDescriptor: { family: ops.family, version: ops.version },
    factors: factors.map((f) => f.id),
  };
  return rule({
    target,
    spec,
    deps: factors,
    eval: (get) => {
      const values = factors.map((f) => get(f));
      const output = values.reduce((acc, v) => ops.scale(acc, v), ops.one());
      return { output, detail: { factors: values } };
    },
  });
}
