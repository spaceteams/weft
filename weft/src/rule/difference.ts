import type { Key } from "../key";
import type { Additive, OpsDescriptor } from "../semantics/algebra";
import { type Rule, rule } from ".";
import { type Operand, operandDep, resolveOperand } from "./operand";

export type DifferenceSpec = {
  op: "difference";
  opsDescriptor: OpsDescriptor;
  minuend: Operand<unknown>;
  subtrahend: Operand<unknown>;
};

export function difference<T>(
  ops: OpsDescriptor & Additive<T>,
  target: Key<T>,
  minuend: Operand<T>,
  subtrahend: Operand<T>,
): Rule<T> {
  const spec: DifferenceSpec = {
    op: "difference",
    opsDescriptor: { family: ops.family, version: ops.version },
    minuend: minuend as Operand<unknown>,
    subtrahend: subtrahend as Operand<unknown>,
  };
  return rule({
    target,
    spec,
    deps: [...operandDep(minuend), ...operandDep(subtrahend)],
    eval: (get) => {
      const output = ops.sub(resolveOperand(minuend, get), resolveOperand(subtrahend, get));
      return { output };
    },
  });
}
