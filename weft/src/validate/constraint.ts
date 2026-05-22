import type { AnyKey, KeyId } from "../key";
import type { Resolver } from "../rule";
import type { ValidationSeverity } from "./validation-result";

/**
 * The result of running a constraint's validate function.
 * Return `null` if the constraint passes.
 */
export type ConstraintResult = null | {
  readonly message: string;
  /** Override the constraint's default severity for this specific result. */
  readonly severity?: ValidationSeverity;
  /** Keys specifically affected by this issue. Falls back to constraint's deps if not provided. */
  readonly affectedKeys?: readonly KeyId[];
};

/**
 * A model-level constraint that validates relationships between multiple keys.
 * Runs after evaluation (needs resolved values via the Resolver).
 *
 * Structurally similar to a Rule (deps + resolver) but produces validation issues
 * instead of a computed value.
 *
 * @example
 * ```ts
 * m.constraint(constraint({
 *   name: "rates-sum-check",
 *   deps: [interest_rate, repayment_rate, special_repayment_rate],
 *   severity: "error",
 *   validate: (get) => {
 *     const sum = get(interest_rate) + get(repayment_rate) + get(special_repayment_rate);
 *     if (sum > 1) return { message: "Combined rates exceed 100%" };
 *     return null;
 *   },
 * }));
 * ```
 */
export type Constraint = {
  readonly name: string;
  readonly deps: readonly AnyKey[];
  readonly severity?: ValidationSeverity;
  readonly validate: (get: Resolver) => ConstraintResult;
};

export function constraint(def: Constraint): Constraint {
  return def;
}
