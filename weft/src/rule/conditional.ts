import type { AnyKey, Key, KeyId } from "../key";
import { type Rule, rule } from ".";
import { type Operand, resolveOperand } from "./operand";

export type ConditionalSpec = {
  op: "conditional";
  condition: KeyId;
  then: unknown;
  otherwise: unknown;
};

export function conditional<T>(
  target: Key<T>,
  condition: Key<boolean>,
  then: Operand<T>,
  otherwise: Operand<T>,
): Rule<T> {
  const deps: AnyKey[] = [condition];
  if (then.__kind === "key") deps.push(then);
  if (otherwise.__kind === "key") deps.push(otherwise);

  const spec: ConditionalSpec = {
    op: "conditional",
    condition: condition.id,
    then,
    otherwise,
  };
  return rule({
    target,
    spec,
    deps,
    eval: (get) => {
      const cond = get(condition);
      const output = cond ? resolveOperand(then, get) : resolveOperand(otherwise, get);
      return { output, detail: { condition: cond } };
    },
  });
}
