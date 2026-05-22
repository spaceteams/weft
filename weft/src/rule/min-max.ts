import type { Key, KeyId } from "../key";
import type { OpsDescriptor, Order } from "../semantics/algebra";
import { type Rule, rule } from ".";

export type MinSpec = {
  op: "min";
  opsDescriptor: OpsDescriptor;
  deps: readonly KeyId[];
};

export type MaxSpec = {
  op: "max";
  opsDescriptor: OpsDescriptor;
  deps: readonly KeyId[];
};

export function minimum<T>(
  ops: OpsDescriptor & Order<T>,
  target: Key<T>,
  deps: readonly Key<T>[],
): Rule<T> {
  if (deps.length === 0) throw new Error("minimum requires at least one dependency");
  const spec: MinSpec = {
    op: "min",
    opsDescriptor: { family: ops.family, version: ops.version },
    deps: deps.map((d) => d.id),
  };
  return rule({
    target,
    spec,
    deps,
    eval: (get) => {
      const values = deps.map((d) => get(d));
      const output = values.reduce((acc, v) => (ops.compare(v, acc) < 0 ? v : acc));
      return { output, detail: { values } };
    },
  });
}

export function maximum<T>(
  ops: OpsDescriptor & Order<T>,
  target: Key<T>,
  deps: readonly Key<T>[],
): Rule<T> {
  if (deps.length === 0) throw new Error("maximum requires at least one dependency");
  const spec: MaxSpec = {
    op: "max",
    opsDescriptor: { family: ops.family, version: ops.version },
    deps: deps.map((d) => d.id),
  };
  return rule({
    target,
    spec,
    deps,
    eval: (get) => {
      const values = deps.map((d) => get(d));
      const output = values.reduce((acc, v) => (ops.compare(v, acc) > 0 ? v : acc));
      return { output, detail: { values } };
    },
  });
}
