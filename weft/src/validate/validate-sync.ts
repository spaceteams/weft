import type { MaybeAsync } from "../maybe-async";
import type { ValidationResult } from "./validation-result";

/**
 * Asserts that a validation result is synchronous.
 * Returns the result if it's not a Promise; throws if it is.
 *
 * Useful for client-side hot paths (e.g. validating on every keystroke)
 * where async validation is not acceptable.
 *
 * @example
 * ```ts
 * const result = validateSync(validateOverlay(model, overlay));
 * // result is guaranteed to be ValidationResult, not Promise
 * ```
 */
export function validateSync(result: MaybeAsync<ValidationResult>): ValidationResult {
  if (result instanceof Promise) {
    throw new Error(
      "validateSync: received an async validation result. " +
        "All schemas used in a synchronous validation path must return results synchronously.",
    );
  }
  return result;
}
