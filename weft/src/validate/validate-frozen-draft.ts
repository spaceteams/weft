import type { FrozenEvaluatedDraft } from "../draft/freeze/freeze-evaluated-draft";
import type { KeyId } from "../key";
import type { FrozenModel } from "../model/freeze-model";
import {
  failedResult,
  type ValidationIssue,
  type ValidationResult,
  type ValidationSeverity,
  validResult,
} from "./validation-result";

/**
 * A synchronous JSON Schema validator function.
 * Consumers provide this (e.g., wrapping Ajv, json-schema-library, or similar).
 *
 * weft does NOT bundle a JSON Schema validator to keep the library lean.
 * Instead, consumers wire in their preferred validator via this adapter type.
 *
 * @param schema - A JSON Schema document.
 * @param value - The value to validate against the schema.
 * @returns An object with `valid` boolean and optional `errors` array.
 */
export type JsonSchemaValidator = (
  schema: Record<string, unknown>,
  value: unknown,
) => { valid: boolean; errors?: Array<{ message: string; path?: string }> };

/**
 * Client-side validation using JSON Schema metadata from a frozen model.
 * Always synchronous. Requires a {@link JsonSchemaValidator} to be provided.
 *
 * Validates:
 * 1. Overlay values against their per-key JSON Schemas (from `frozenModel.jsonSchemas`)
 * 2. Cross-field constraints that have been serialized as JSON Schema
 *    (from `frozenModel.constraints`)
 *
 * Keys without JSON Schema metadata are skipped (they can only be validated server-side).
 *
 * @param frozenModel - The frozen model containing JSON Schema metadata.
 * @param draft - The frozen evaluated draft whose overlay values should be validated.
 * @param validator - A synchronous JSON Schema validator adapter.
 * @returns A synchronous {@link ValidationResult}.
 */
export function validateFrozenDraft(
  frozenModel: FrozenModel,
  draft: FrozenEvaluatedDraft,
  validator: JsonSchemaValidator,
): ValidationResult {
  const issues: ValidationIssue[] = [];

  // 1. Validate overlay values against per-key JSON Schemas
  if (frozenModel.jsonSchemas) {
    for (const keyId of Object.keys(draft.overlay)) {
      const entry = frozenModel.jsonSchemas[keyId as KeyId];
      if (!entry) continue;

      const value = draft.overlay[keyId];
      const severity: ValidationSeverity = entry.severity ?? "error";
      const result = validator(entry.schema as Record<string, unknown>, value);

      if (!result.valid && result.errors) {
        for (const error of result.errors) {
          issues.push({
            key: keyId as KeyId,
            message: error.message,
            severity,
            path: error.path ? [error.path] : undefined,
          });
        }
      } else if (!result.valid) {
        issues.push({
          key: keyId as KeyId,
          message: "Value does not match schema",
          severity,
        });
      }
    }
  }

  // 2. Validate cross-field constraints with JSON Schema
  if (frozenModel.constraints) {
    for (const constraint of frozenModel.constraints) {
      if (!constraint.jsonSchema) continue;

      // Build the value object from effective facts for the constraint's affected keys
      const constraintValue: Record<string, unknown> = {};
      for (const keyId of constraint.affectedKeys) {
        if (keyId in draft.effective) {
          constraintValue[keyId] = draft.effective[keyId];
        } else if (keyId in draft.values) {
          constraintValue[keyId] = draft.values[keyId];
        }
      }

      const severity: ValidationSeverity = constraint.severity ?? "error";
      const result = validator(constraint.jsonSchema as Record<string, unknown>, constraintValue);

      if (!result.valid && result.errors) {
        for (const error of result.errors) {
          // Attribute the issue to all affected keys
          for (const keyId of constraint.affectedKeys) {
            issues.push({
              key: keyId,
              message: error.message || `Constraint "${constraint.name}" failed`,
              severity,
            });
          }
        }
      } else if (!result.valid) {
        for (const keyId of constraint.affectedKeys) {
          issues.push({
            key: keyId,
            message: `Constraint "${constraint.name}" failed`,
            severity,
          });
        }
      }
    }
  }

  return issues.length === 0 ? validResult() : failedResult(issues);
}
