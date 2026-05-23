import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { Key } from "../key";
import type { ValidationSeverity } from "./validation-result";

/**
 * Associates a Key<T> with a StandardSchemaV1-conforming schema.
 * The schema validates unknown input and produces T.
 */
export type KeySchema<T> = {
  readonly key: Key<T>;
  readonly schema: StandardSchemaV1<unknown, T>;
  /** Default severity for issues produced by this schema. Defaults to "error". */
  readonly severity?: ValidationSeverity;
  /**
   * Explicit JSON Schema for this key. Used during model freezing as a fallback
   * when the schema library does not support the `~standard.jsonSchema` extension.
   *
   * If the schema library does expose `~standard.jsonSchema`, it takes precedence.
   */
  readonly jsonSchema?: Record<string, unknown>;
};

/**
 * Creates a KeySchema associating a typed key with a standard schema.
 *
 * @param key - The key to attach the schema to.
 * @param schema - A StandardSchemaV1-conforming schema (e.g. from Zod, Valibot, ArkType).
 * @param severity - Default severity for validation issues. Defaults to "error".
 */
export function keySchema<T>(
  key: Key<T>,
  schema: StandardSchemaV1<unknown, T>,
  severity?: ValidationSeverity,
): KeySchema<T> {
  return { key, schema, severity };
}
