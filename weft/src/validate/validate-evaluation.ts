import type { EvaluationResult } from "../evaluate";
import type { Key } from "../key";
import type { MaybeAsync } from "../maybe-async";
import type { CompiledModel } from "../model";
import type { Resolver } from "../rule";
import type { Constraint, ConstraintResult } from "./constraint";
import type { ValidationContext } from "./validation-context";
import {
  failedResult,
  type ValidationIssue,
  type ValidationResult,
  type ValidationSeverity,
  validResult,
} from "./validation-result";

/**
 * Validates computed (rule output) values against their declared schemas,
 * and runs model-level constraints against the full evaluation result.
 *
 * This runs AFTER evaluation — it validates derived values, not inputs.
 */
export function validateEvaluation(
  model: CompiledModel,
  result: EvaluationResult,
  context?: ValidationContext,
): MaybeAsync<ValidationResult> {
  const issues: ValidationIssue[] = [];
  const pending: Promise<ValidationIssue[]>[] = [];

  // 1. Validate rule output values against their schemas
  for (const target of model.orderedRuleTargets) {
    const keySchema = model.schemas.get(target);
    if (!keySchema) continue;

    const value = result.values.get(target);
    if (value === undefined && !result.values.has(target)) continue;

    const options = context ? { libraryOptions: context } : undefined;
    const schemaResult = keySchema.schema["~standard"].validate(value, options);

    if (schemaResult instanceof Promise) {
      pending.push(
        schemaResult.then((resolved) => {
          if (!resolved.issues) return [];
          const severity: ValidationSeverity = keySchema.severity ?? "warning";
          return resolved.issues.map((issue) => ({
            key: target,
            message: issue.message,
            severity,
            path: issue.path,
          }));
        }),
      );
    } else {
      if (schemaResult.issues) {
        const severity: ValidationSeverity = keySchema.severity ?? "warning";
        for (const issue of schemaResult.issues) {
          issues.push({
            key: target,
            message: issue.message,
            severity,
            path: issue.path,
          });
        }
      }
    }
  }

  // 2. Run model-level constraints
  for (const c of model.constraints) {
    const constraintIssues = runConstraint(c, result);
    issues.push(...constraintIssues);
  }

  if (pending.length === 0) {
    return issues.length === 0 ? validResult() : failedResult(issues);
  }

  return Promise.all(pending).then((asyncResults) => {
    for (const asyncIssues of asyncResults) {
      issues.push(...asyncIssues);
    }
    return issues.length === 0 ? validResult() : failedResult(issues);
  });
}

/** @internal Run a single constraint against evaluation values. */
function runConstraint(c: Constraint, result: EvaluationResult): ValidationIssue[] {
  // Check all deps are available
  for (const dep of c.deps) {
    if (!result.values.has(dep.id)) {
      // Skip constraint if deps are missing (lenient behavior)
      return [];
    }
  }

  const get: Resolver = <T>(key: Key<T>) => {
    return result.values.get(key.id) as T;
  };

  let constraintResult: ConstraintResult;
  try {
    constraintResult = c.validate(get);
  } catch {
    return [
      {
        key: c.deps[0]?.id ?? "unknown",
        message: `Constraint "${c.name}" threw an error during validation.`,
        severity: "error",
      },
    ];
  }

  if (constraintResult === null) return [];

  const severity = constraintResult.severity ?? c.severity ?? "error";
  const affectedKeys = constraintResult.affectedKeys ?? c.deps.map((d) => d.id);

  return affectedKeys.map((keyId) => ({
    key: keyId,
    message: constraintResult!.message,
    severity,
  }));
}
