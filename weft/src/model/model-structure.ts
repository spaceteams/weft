import type { KeyId } from "../key";
import type { KeyMeta } from "../key-meta";
import type { LayerMeta } from "../layer-meta";
import type { ValidationSeverity } from "../validate/validation-result";

/**
 * Simple value type discriminator for a key.
 * Derived from the JSON Schema `type` field during model freeze.
 */
export type KeyValueType =
  | "number"
  | "integer"
  | "string"
  | "boolean"
  | "object"
  | "array"
  | "unknown";

/**
 * The structural subset of a compiled model that enables graph traversal,
 * impact analysis, and inspection without the live rule functions.
 *
 * Both {@link CompiledModel} and hydrated frozen models satisfy this interface
 * via TypeScript structural typing — no explicit `extends` required.
 */
export type ModelStructure = {
  readonly inputKeys: readonly KeyId[];
  readonly orderedRuleTargets: readonly KeyId[];
  readonly depsByTarget: ReadonlyMap<KeyId, readonly KeyId[]>;
  readonly dependentsByKey: ReadonlyMap<KeyId, readonly KeyId[]>;
  readonly keyMeta: ReadonlyMap<KeyId, KeyMeta>;
  /**
   * Optional map from rule target to its spec object.
   * Enables {@link inspectModelTarget} on hydrated frozen models.
   */
  readonly ruleSpecs?: ReadonlyMap<KeyId, Record<string, unknown>>;
  /**
   * Optional map from key ID to its JSON Schema (from StandardJSONSchemaV1).
   * Present on hydrated frozen models that included JSON Schema metadata.
   * Enables client-side validation without round-trips to the server.
   */
  readonly jsonSchemas?: ReadonlyMap<
    KeyId,
    {
      readonly schema: Record<string, unknown>;
      readonly severity?: ValidationSeverity;
    }
  >;
  /**
   * Optional array of frozen cross-field constraint metadata.
   * Contains structural information about constraints for client-side analysis.
   * Only constraints expressible as JSON Schema include the `jsonSchema` field.
   */
  readonly constraints?: ReadonlyArray<{
    readonly name: string;
    readonly affectedKeys?: readonly KeyId[];
    readonly severity?: ValidationSeverity;
    readonly jsonSchema?: Record<string, unknown>;
  }>;
  /**
   * Optional map from key ID to the inferred value type tag.
   * Derived from JSON Schema `type` during freeze, provides a simple
   * discriminator for consumers that need to switch on value types
   * without parsing full JSON schemas.
   */
  readonly keyValueTypes?: ReadonlyMap<KeyId, KeyValueType>;
  /**
   * Optional layer metadata from a frozen model.
   * Contains layer names, versions, and serialized input annotations.
   * Present on hydrated frozen models that had registered layers.
   */
  readonly layers?: readonly LayerMeta[];
};
