import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { FactBag } from "../facts";
import type { KeyId } from "../key";
import type { MaybeAsync } from "../maybe-async";
import type { CompiledModel } from "../model";
import type { KeySchema } from "./key-schema";
import type { ValidationContext } from "./validation-context";
import {
  failedResult,
  type ValidationIssue,
  type ValidationResult,
  type ValidationSeverity,
  validResult,
} from "./validation-result";

/**
 * Validates all input values in `facts` against their declared schemas.
 * Keys without schemas are skipped (treated as valid).
 *
 * Returns synchronously if all schemas validate synchronously,
 * otherwise returns a Promise.
 */
export function validateFacts(
  model: CompiledModel,
  facts: FactBag,
  context?: ValidationContext,
): MaybeAsync<ValidationResult> {
  return validateRecord(model, facts, model.inputKeys, context);
}

/** @internal Shared logic for validating a record of values against model schemas. */
export function validateRecord(
  model: CompiledModel,
  values: Record<string, unknown>,
  keys: Iterable<KeyId>,
  context?: ValidationContext,
): MaybeAsync<ValidationResult> {
  const issues: ValidationIssue[] = [];
  const pending: Promise<ValidationIssue[]>[] = [];

  for (const keyId of keys) {
    const keySchema = model.schemas.get(keyId);
    if (!keySchema) continue;

    const value = values[keyId];
    const result = runSchema(keyId, keySchema, value, context);

    if (result instanceof Promise) {
      pending.push(result);
    } else {
      issues.push(...result);
    }
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

/** @internal Run a single key's schema and map issues. */
function runSchema(
  keyId: KeyId,
  keySchema: KeySchema<unknown>,
  value: unknown,
  context?: ValidationContext,
): ValidationIssue[] | Promise<ValidationIssue[]> {
  const options: StandardSchemaV1.Options | undefined = context
    ? { libraryOptions: context }
    : undefined;

  const result = keySchema.schema["~standard"].validate(value, options);

  if (result instanceof Promise) {
    return result.then((resolved) => mapSchemaResult(keyId, keySchema, resolved));
  }

  return mapSchemaResult(keyId, keySchema, result);
}

/** @internal Map a StandardSchemaV1.Result to ValidationIssue[]. */
function mapSchemaResult(
  keyId: KeyId,
  keySchema: KeySchema<unknown>,
  result: StandardSchemaV1.Result<unknown>,
): ValidationIssue[] {
  if (!result.issues) return [];

  const defaultSeverity: ValidationSeverity = keySchema.severity ?? "error";

  return result.issues.map((issue) => ({
    key: keyId,
    message: issue.message,
    severity: defaultSeverity,
    path: issue.path,
  }));
}
