import type { Key } from "../key";
import type { Value } from "../value";

export type Operand<T> = Value<T> | Key<T>;

export function resolveOperand<T>(operand: Operand<T>, get: (k: Key<T>) => T): T {
  return operand.__kind === "value" ? operand.value : get(operand);
}
