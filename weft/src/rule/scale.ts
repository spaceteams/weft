import type { AnyKey, Key, KeyId } from "../key";
import type { OpsDescriptor, Scalable } from "../semantics/algebra";
import { type Rule, rule } from ".";
import { type Operand, resolveOperand } from "./operand";

export type ScaleTraceSpec = {
  op: "scale";
  opsDescriptor: OpsDescriptor;
  input: KeyId;
  factor: Operand<unknown>;
};

export function scale<T, S>(
  ops: OpsDescriptor & Scalable<T, S>,
  target: Key<T>,
  input: Key<T>,
  factor: Operand<S>,
): Rule<T> {
  const spec: ScaleTraceSpec = {
    op: "scale",
    opsDescriptor: { family: ops.family, version: ops.version },
    input: input.id,
    factor: factor as Operand<unknown>,
  };
  const deps: AnyKey[] = [input];
  if (factor.__kind === "key") deps.push(factor);
  return rule({
    target,
    spec,
    deps,
    eval: (get) => {
      const output = ops.scale(get(input), resolveOperand(factor, get));
      return { output };
    },
  });
}
