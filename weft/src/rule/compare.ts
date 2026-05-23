import type { AnyKey, Key, KeyId } from "../key";
import { type Rule, rule } from ".";
import { type Operand, resolveOperand } from "./operand";

export type CompareOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte";

export type CompareSpec = {
  op: "compare";
  left: KeyId;
  right: unknown;
  compareOp: CompareOp;
};

export function compare<T>(
  target: Key<boolean>,
  left: Key<T>,
  right: Operand<T>,
  compareOp: CompareOp,
): Rule<boolean> {
  const deps: AnyKey[] = [left];
  if (right.__kind === "key") deps.push(right);

  const spec: CompareSpec = {
    op: "compare",
    left: left.id,
    right: right.__kind === "key" ? right.id : (right as { value: unknown }).value,
    compareOp,
  };
  return rule({
    target,
    spec,
    deps,
    eval: (get) => {
      const a = get(left) as unknown;
      const b = resolveOperand(right, get) as unknown;
      let output: boolean;
      switch (compareOp) {
        case "eq":
          output = a === b;
          break;
        case "neq":
          output = a !== b;
          break;
        case "gt":
          output = (a as number) > (b as number);
          break;
        case "gte":
          output = (a as number) >= (b as number);
          break;
        case "lt":
          output = (a as number) < (b as number);
          break;
        case "lte":
          output = (a as number) <= (b as number);
          break;
      }
      return { output, detail: { left: a, right: b, compareOp } };
    },
  });
}
