import type { AnyKey, Key } from "../key";
import type { Value } from "../value";

export type Operand<T> = Value<T> | Key<T>;

export function resolveOperand<T>(operand: Operand<T>, get: (k: Key<T>) => T): T {
  return operand.__kind === "value" ? operand.value : get(operand);
}

/**
 * Extract the key dependencies from a list of operands.
 * Literal `value()` operands don't contribute to the dependency graph.
 */
export function operandDeps<T>(operands: readonly Operand<T>[]): AnyKey[] {
  return operands.filter((o): o is Key<T> => o.__kind === "key");
}

/**
 * Collect key dependencies from individual operands (for rules with
 * fixed-arity params like `difference(minuend, subtrahend)`).
 */
export function operandDep<T>(operand: Operand<T>): AnyKey[] {
  return operand.__kind === "key" ? [operand] : [];
}
