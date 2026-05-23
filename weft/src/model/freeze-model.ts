import type { KeyId } from "../key";
import type { KeyMeta } from "../key-meta";
import type { RuleMeta } from "../rule/rule-meta";
import { type CanonicalJson, canonicalize } from "../snapshot/canonicalize";
import type { ValidationSeverity } from "../validate/validation-result";
import type { CompiledModel } from ".";
import type { KeyValueType, ModelStructure } from "./model-structure";

// ---------------------------------------------------------------------------
// FrozenModel — JSON-serializable representation of the model structure
// ---------------------------------------------------------------------------

/**
 * A JSON-serializable snapshot of a model's structural information.
 *
 * Contains everything needed to perform graph traversal, impact analysis,
 * diff grouping, and inspection on the client — without the live rule
 * functions or key semantics that require server-side code.
 *
 * Use {@link freezeModel} to create and {@link hydrateModel} to restore
 * a {@link ModelStructure} with proper Map instances.
 */
export type FrozenModel = {
  readonly inputKeys: readonly KeyId[];
  readonly orderedRuleTargets: readonly KeyId[];
  readonly depsByTarget: Readonly<Record<KeyId, readonly KeyId[]>>;
  readonly dependentsByKey: Readonly<Record<KeyId, readonly KeyId[]>>;
  readonly keyMeta: Readonly<Record<KeyId, KeyMeta>>;
  readonly ruleMeta: Readonly<Record<KeyId, RuleMeta>>;
  readonly ruleSpecs: Readonly<Record<KeyId, Record<string, CanonicalJson>>>;
  readonly jsonSchemas?: Readonly<
    Record<
      KeyId,
      {
        readonly schema: Record<string, CanonicalJson>;
        readonly severity?: ValidationSeverity;
      }
    >
  >;
  readonly constraints?: ReadonlyArray<{
    readonly name: string;
    readonly affectedKeys: readonly KeyId[];
    readonly severity?: ValidationSeverity;
    readonly jsonSchema?: Record<string, CanonicalJson>;
  }>;
  readonly keyValueTypes?: Readonly<Record<KeyId, KeyValueType>>;
};

/**
 * Serialize a {@link CompiledModel} into a {@link FrozenModel} suitable for
 * JSON serialization and transport to a frontend or worker.
 *
 * Rule specs are canonicalized (keys sorted, values normalized) to ensure
 * deterministic serialization and consistent fingerprinting.
 */
export function freezeModel(model: CompiledModel): FrozenModel {
  const ruleSpecs: Record<KeyId, Record<string, CanonicalJson>> = {};
  for (const [key, spec] of model.ruleSpecs) {
    const canonical: Record<string, CanonicalJson> = {};
    for (const [k, v] of Object.entries(spec)) {
      canonical[k] = canonicalize(v);
    }
    ruleSpecs[key] = canonical;
  }

  // Freeze JSON Schemas from StandardJSONSchemaV1-conforming schemas
  let jsonSchemas:
    | Record<KeyId, { schema: Record<string, CanonicalJson>; severity?: ValidationSeverity }>
    | undefined;
  for (const [keyId, keySchema] of model.schemas) {
    const standard = keySchema.schema["~standard"] as unknown as Record<string, unknown>;
    if ("jsonSchema" in standard) {
      try {
        const converter = standard.jsonSchema as {
          input: (options: { target: string }) => Record<string, unknown>;
        };
        const raw = converter.input({ target: "draft-2020-12" });
        const schema: Record<string, CanonicalJson> = {};
        for (const [k, v] of Object.entries(raw)) {
          schema[k] = canonicalize(v);
        }
        if (!jsonSchemas) {
          jsonSchemas = {};
        }
        const entry: { schema: Record<string, CanonicalJson>; severity?: ValidationSeverity } = {
          schema,
        };
        if (keySchema.severity) {
          (entry as { severity?: ValidationSeverity }).severity = keySchema.severity;
        }
        jsonSchemas[keyId] = entry;
      } catch {
        // Silently skip — library does not support the requested target
      }
    }
  }

  // Fallback: use explicit JSON Schemas for keys not covered by ~standard.jsonSchema
  for (const [keyId, schema] of model.explicitJsonSchemas) {
    if (jsonSchemas && keyId in jsonSchemas) continue; // ~standard.jsonSchema took precedence
    if (!jsonSchemas) {
      jsonSchemas = {};
    }
    const canonicalSchema: Record<string, CanonicalJson> = {};
    for (const [k, v] of Object.entries(schema)) {
      canonicalSchema[k] = canonicalize(v);
    }
    jsonSchemas[keyId] = { schema: canonicalSchema };
  }

  // Derive key value types from JSON Schema type field
  let keyValueTypes: Record<KeyId, KeyValueType> | undefined;
  if (jsonSchemas) {
    keyValueTypes = {};
    const allKeys = [...model.inputKeys, ...model.orderedRuleTargets];
    for (const keyId of allKeys) {
      const entry = jsonSchemas[keyId];
      if (entry) {
        const schemaType = entry.schema.type;
        if (
          schemaType === "number" ||
          schemaType === "integer" ||
          schemaType === "string" ||
          schemaType === "boolean" ||
          schemaType === "object" ||
          schemaType === "array"
        ) {
          keyValueTypes[keyId] = schemaType;
        } else {
          keyValueTypes[keyId] = "unknown";
        }
      } else {
        keyValueTypes[keyId] = "unknown";
      }
    }
  }

  // Freeze constraints
  let constraints:
    | Array<{
        name: string;
        affectedKeys: readonly KeyId[];
        severity?: ValidationSeverity;
        jsonSchema?: Record<string, CanonicalJson>;
      }>
    | undefined;
  if (model.constraints.length > 0) {
    constraints = model.constraints.map((c) => {
      const entry: {
        name: string;
        affectedKeys: readonly KeyId[];
        severity?: ValidationSeverity;
        jsonSchema?: Record<string, CanonicalJson>;
      } = {
        name: c.name,
        affectedKeys: c.deps.map((dep) => dep.id),
      };
      if (c.severity) {
        entry.severity = c.severity;
      }
      return entry;
    });
  }

  const result: FrozenModel = {
    inputKeys: [...model.inputKeys],
    orderedRuleTargets: [...model.orderedRuleTargets],
    depsByTarget: Object.fromEntries(model.depsByTarget),
    dependentsByKey: Object.fromEntries(model.dependentsByKey),
    keyMeta: Object.fromEntries(model.keyMeta),
    ruleMeta: Object.fromEntries(model.ruleMeta),
    ruleSpecs,
  };

  if (jsonSchemas) {
    (result as { jsonSchemas?: typeof jsonSchemas }).jsonSchemas = jsonSchemas;
  }
  if (constraints) {
    (result as { constraints?: typeof constraints }).constraints = constraints;
  }
  if (keyValueTypes) {
    (result as { keyValueTypes?: typeof keyValueTypes }).keyValueTypes = keyValueTypes;
  }

  return result;
}

/**
 * Hydrate a {@link FrozenModel} back into a {@link ModelStructure} with
 * proper Map instances, ready for use with graph traversal, impact analysis,
 * and inspection functions.
 */
export function hydrateModel(frozen: FrozenModel): ModelStructure {
  const result: ModelStructure = {
    inputKeys: frozen.inputKeys,
    orderedRuleTargets: frozen.orderedRuleTargets,
    depsByTarget: new Map(Object.entries(frozen.depsByTarget)),
    dependentsByKey: new Map(Object.entries(frozen.dependentsByKey)),
    keyMeta: new Map(Object.entries(frozen.keyMeta)),
    ruleMeta: new Map(Object.entries(frozen.ruleMeta)),
    ruleSpecs: new Map(Object.entries(frozen.ruleSpecs)),
  };

  if (frozen.jsonSchemas) {
    (result as { jsonSchemas?: ModelStructure["jsonSchemas"] }).jsonSchemas = new Map(
      Object.entries(frozen.jsonSchemas),
    );
  }
  if (frozen.constraints) {
    (result as { constraints?: ModelStructure["constraints"] }).constraints = frozen.constraints;
  }
  if (frozen.keyValueTypes) {
    (result as { keyValueTypes?: ModelStructure["keyValueTypes"] }).keyValueTypes = new Map(
      Object.entries(frozen.keyValueTypes) as [KeyId, KeyValueType][],
    );
  }

  return result;
}
