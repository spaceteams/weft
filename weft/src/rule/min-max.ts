import type { Key } from "../key";
import type { OpsDescriptor, Order } from "../semantics/algebra";
import { type Rule, rule } from ".";
import { type Operand, operandDeps, resolveOperand } from "./operand";

export type MinSpec = {
  op: "min";
  opsDescriptor: OpsDescriptor;
  deps: readonly Operand<unknown>[];
};

export type MaxSpec = {
  op: "max";
  opsDescriptor: OpsDescriptor;
  deps: readonly Operand<unknown>[];
};

export function minimum<T>(
  ops: OpsDescriptor & Order<T>,
  target: Key<T>,
  deps: readonly Operand<T>[],
): Rule<T> {
  if (deps.length === 0) throw new Error("minimum requires at least one dependency");
  const spec: MinSpec = {
    op: "min",
    opsDescriptor: { family: ops.family, version: ops.version },
    deps: deps as readonly Operand<unknown>[],
  };
  return rule({
    target,
    spec,
    deps: operandDeps(deps),
    eval: (get) => {
      const values = deps.map((d) => resolveOperand(d, get));
      const output = values.reduce((acc, v) => (ops.compare(v, acc) < 0 ? v : acc));
      return { output, detail: { values } };
    },
  });
}

export function maximum<T>(
  ops: OpsDescriptor & Order<T>,
  target: Key<T>,
  deps: readonly Operand<T>[],
): Rule<T> {
  if (deps.length === 0) throw new Error("maximum requires at least one dependency");
  const spec: MaxSpec = {
    op: "max",
    opsDescriptor: { family: ops.family, version: ops.version },
    deps: deps as readonly Operand<unknown>[],
  };
  return rule({
    target,
    spec,
    deps: operandDeps(deps),
    eval: (get) => {
      const values = deps.map((d) => resolveOperand(d, get));
      const output = values.reduce((acc, v) => (ops.compare(v, acc) > 0 ? v : acc));
      return { output, detail: { values } };
    },
  });
}
