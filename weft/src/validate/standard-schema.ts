import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { FactBag } from "../facts";
import type { Key, KeyId } from "../key";
import type { MaybeAsync } from "../maybe-async";
import type { CompiledModel } from "../model";
import type { Overlay } from "../overlay";
import { validateRecord } from "./validate-facts";
import type { ValidationResult } from "./validation-result";

/**
 * Wraps a {@link CompiledModel} as a `StandardSchemaV1` that validates FactBags.
 *
 * This means form libraries or API frameworks that accept `StandardSchemaV1`
 * can directly validate request bodies against a weft model.
 *
 * - vendor: `"@spaceteams/weft"`
 * - version: `1`
 * - validate: runs schema validation for all declared input keys
 *
 * @example
 * ```ts
 * const schema = toStandardSchema(compiledModel);
 * // Use with any Standard Schema consumer (e.g., a form library)
 * const result = schema["~standard"].validate(factsFromRequest);
 * ```
 */
export function toStandardSchema(model: CompiledModel): StandardSchemaV1<FactBag, FactBag> {
  return {
    "~standard": {
      version: 1,
      vendor: "@spaceteams/weft",
      validate: (value) => {
        const facts = value as FactBag;
        const result = validateRecord(model, facts, model.inputKeys);
        return mapValidationResult(result, facts);
      },
    },
  };
}

/**
 * Extracts a single key's schema as a standalone `StandardSchemaV1`.
 * Returns `undefined` if the key has no declared schema.
 *
 * Useful for integrating individual field validation into form libraries
 * that accept per-field `StandardSchemaV1` instances.
 *
 * @example
 * ```ts
 * const schema = toKeySchema(compiledModel, loanAmount);
 * if (schema) {
 *   const result = schema["~standard"].validate(userInput);
 * }
 * ```
 */
export function toKeySchema<T>(
  model: CompiledModel,
  key: Key<T>,
): StandardSchemaV1<unknown, T> | undefined {
  const keySchema = model.schemas.get(key.id);
  if (!keySchema) return undefined;

  return {
    "~standard": {
      version: 1,
      vendor: "@spaceteams/weft",
      validate: (value) => {
        const result = validateRecord(model, { [key.id]: value }, [key.id]);
        return mapValidationResult(result, value as T);
      },
    },
  };
}

/**
 * Wraps a {@link CompiledModel} as a `StandardSchemaV1` that validates Overlays.
 *
 * Unlike the fact-bag schema from {@link toStandardSchema}, this allows partial
 * input — only keys present in the overlay are validated.
 *
 * This is ideal for validating incremental user edits in a spreadsheet-like UI.
 *
 * @example
 * ```ts
 * const schema = toOverlaySchema(compiledModel);
 * const result = schema["~standard"].validate({ interest_rate: 0.05 });
 * ```
 */
export function toOverlaySchema(model: CompiledModel): StandardSchemaV1<Overlay, Overlay> {
  return {
    "~standard": {
      version: 1,
      vendor: "@spaceteams/weft",
      validate: (value) => {
        const overlay = value as Overlay;
        const overlayKeys: KeyId[] = Object.keys(overlay);
        const result = validateRecord(model, overlay, overlayKeys);
        return mapValidationResult(result, overlay);
      },
    },
  };
}

/** @internal Map a weft ValidationResult to a StandardSchemaV1.Result. */
function mapValidationResult<T>(
  result: MaybeAsync<ValidationResult>,
  value: T,
): StandardSchemaV1.Result<T> | Promise<StandardSchemaV1.Result<T>> {
  if (result instanceof Promise) {
    return result.then((resolved) => toStandardResult(resolved, value));
  }
  return toStandardResult(result, value);
}

/** @internal Convert a resolved ValidationResult to StandardSchemaV1.Result. */
function toStandardResult<T>(result: ValidationResult, value: T): StandardSchemaV1.Result<T> {
  if (result.valid) {
    return { value };
  }

  return {
    issues: result.issues.map((issue) => ({
      message: issue.message,
      path: issue.path as ReadonlyArray<PropertyKey | StandardSchemaV1.PathSegment> | undefined,
    })),
  };
}
