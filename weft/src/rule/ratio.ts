import type { AnyKey, Key, KeyId } from "../key";
import type { Divisible, OpsDescriptor } from "../semantics/algebra";
import { type Rule, rule } from ".";
import { type Operand, resolveOperand } from "./operand";

export type RatioTraceSpec = {
  op: "ratio";
  opsDescriptor: OpsDescriptor;
  numerator: KeyId;
  denominator: Operand<unknown>;
};

export function ratio<T, R>(
  ops: OpsDescriptor & Divisible<T, R>,
  target: Key<R>,
  numerator: Key<T>,
  denominator: Operand<T>,
): Rule<R> {
  const spec: RatioTraceSpec = {
    op: "ratio",
    opsDescriptor: { family: ops.family, version: ops.version },
    numerator: numerator.id,
    denominator: denominator as Operand<unknown>,
  };
  const deps: AnyKey[] = [numerator];
  if (denominator.__kind === "key") deps.push(denominator);
  return rule({
    target,
    spec,
    deps,
    eval: (get) => {
      const output = ops.div(get(numerator), resolveOperand(denominator, get));
      return { output };
    },
  });
}
