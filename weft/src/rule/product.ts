import type { AnyKey, Key } from "../key";
import type { OpsDescriptor, Scalable } from "../semantics/algebra";
import { type Rule, rule } from ".";
import { type Operand, resolveOperand } from "./operand";

export type ProductSpec = {
  op: "product";
  opsDescriptor: OpsDescriptor;
  factors: readonly Operand<unknown>[];
};

export function product<T>(
  ops: OpsDescriptor & Scalable<T, T>,
  target: Key<T>,
  factors: readonly Operand<T>[],
): Rule<T> {
  const spec: ProductSpec = {
    op: "product",
    opsDescriptor: { family: ops.family, version: ops.version },
    factors: factors as readonly Operand<unknown>[],
  };
  const deps: AnyKey[] = factors.filter((f): f is Key<T> => f.__kind === "key");
  return rule({
    target,
    spec,
    deps,
    eval: (get) => {
      const values = factors.map((f) => resolveOperand(f, get));
      const output = values.reduce((acc, v) => ops.scale(acc, v), ops.one());
      return { output, detail: { factors: values } };
    },
  });
}
