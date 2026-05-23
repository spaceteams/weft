import type { StandardSchemaV1 } from "@standard-schema/spec";
import { type Input, input } from "../input";
import type { Key, KeyId, KeySemantics } from "../key";
import type { KeyMeta } from "../key-meta";
import type { Rule } from "../rule";
import type { RuleMeta } from "../rule/rule-meta";
import type { Constraint } from "../validate/constraint";
import type { KeySchema } from "../validate/key-schema";
import type { ValidationSeverity } from "../validate/validation-result";
import type { Model } from ".";

export type InputOptions<T> = {
  meta?: KeyMeta;
  semantics?: Partial<KeySemantics<T>>;
  schema?: StandardSchemaV1<unknown, T>;
  schemaSeverity?: ValidationSeverity;
  /**
   * Explicit JSON Schema for this key. Used during model freezing when the
   * schema library doesn't support `~standard.jsonSchema`.
   * Can be provided without a `schema` for metadata-only use.
   */
  jsonSchema?: Record<string, unknown>;
};

export type RuleOptions<T> = {
  meta?: RuleMeta;
  semantics?: Partial<KeySemantics<T>>;
  schema?: StandardSchemaV1<unknown, T>;
  schemaSeverity?: ValidationSeverity;
  /**
   * Explicit JSON Schema for this key. Used during model freezing when the
   * schema library doesn't support `~standard.jsonSchema`.
   * Can be provided without a `schema` for metadata-only use.
   */
  jsonSchema?: Record<string, unknown>;
};

export function createModel() {
  const inputs: Input<unknown>[] = [];
  const rules: Rule<unknown>[] = [];
  const keyMeta: Map<KeyId, KeyMeta> = new Map();
  const ruleMeta: Map<KeyId, RuleMeta> = new Map();
  const semanticsMap: Map<KeyId, Partial<KeySemantics<unknown>>> = new Map();
  const schemas: Map<KeyId, KeySchema<unknown>> = new Map();
  const explicitJsonSchemas: Map<KeyId, Record<string, unknown>> = new Map();
  const constraints: Constraint[] = [];
  return {
    input<T>(
      k: Key<T>,
      metaOrOpts?: KeyMeta | InputOptions<T>,
      semantics?: Partial<KeySemantics<T>>,
    ): Key<T> {
      inputs.push(input(k));

      const opts = resolveInputArgs(metaOrOpts, semantics);
      keyMeta.set(k.id, opts.meta);
      if (opts.semantics) {
        semanticsMap.set(k.id, opts.semantics as Partial<KeySemantics<unknown>>);
      }
      if (opts.schema) {
        schemas.set(k.id, {
          key: k,
          schema: opts.schema,
          severity: opts.schemaSeverity,
          jsonSchema: opts.jsonSchema,
        } as KeySchema<unknown>);
      }
      if (opts.jsonSchema) {
        explicitJsonSchemas.set(k.id, opts.jsonSchema);
      }

      return k;
    },
    rule<T>(
      r: Rule<T>,
      metaOrOpts?: RuleMeta | RuleOptions<T>,
      semantics?: Partial<KeySemantics<T>>,
    ): Key<T> {
      rules.push(r);

      const opts = resolveRuleArgs(metaOrOpts, semantics);
      ruleMeta.set(r.target.id, opts.meta);
      if (opts.semantics) {
        semanticsMap.set(r.target.id, opts.semantics as Partial<KeySemantics<unknown>>);
      }
      if (opts.schema) {
        schemas.set(r.target.id, {
          key: r.target,
          schema: opts.schema,
          severity: opts.schemaSeverity ?? "warning",
          jsonSchema: opts.jsonSchema,
        } as KeySchema<unknown>);
      }
      if (opts.jsonSchema) {
        explicitJsonSchemas.set(r.target.id, opts.jsonSchema);
      }

      return r.target;
    },
    constraint(def: Constraint): void {
      constraints.push(def);
    },
    build(): Model {
      return {
        inputs,
        rules,
        semantics: semanticsMap,
        keyMeta,
        ruleMeta,
        schemas,
        constraints,
        explicitJsonSchemas,
      };
    },
  };
}

function isInputOptions<T>(value: unknown): value is InputOptions<T> {
  if (value == null || typeof value !== "object") return false;
  return "schema" in value || "meta" in value || "semantics" in value || "jsonSchema" in value;
}

function isRuleOptions<T>(value: unknown): value is RuleOptions<T> {
  if (value == null || typeof value !== "object") return false;
  return "schema" in value || "meta" in value || "semantics" in value || "jsonSchema" in value;
}

function resolveInputArgs<T>(
  metaOrOpts?: KeyMeta | InputOptions<T>,
  semantics?: Partial<KeySemantics<T>>,
): {
  meta: KeyMeta;
  semantics?: Partial<KeySemantics<T>>;
  schema?: StandardSchemaV1<unknown, T>;
  schemaSeverity?: ValidationSeverity;
  jsonSchema?: Record<string, unknown>;
} {
  if (isInputOptions<T>(metaOrOpts)) {
    return {
      meta: metaOrOpts.meta ?? {},
      semantics: metaOrOpts.semantics,
      schema: metaOrOpts.schema,
      schemaSeverity: metaOrOpts.schemaSeverity,
      jsonSchema: metaOrOpts.jsonSchema,
    };
  }
  return { meta: metaOrOpts ?? {}, semantics };
}

function resolveRuleArgs<T>(
  metaOrOpts?: RuleMeta | RuleOptions<T>,
  semantics?: Partial<KeySemantics<T>>,
): {
  meta: RuleMeta;
  semantics?: Partial<KeySemantics<T>>;
  schema?: StandardSchemaV1<unknown, T>;
  schemaSeverity?: ValidationSeverity;
  jsonSchema?: Record<string, unknown>;
} {
  if (isRuleOptions<T>(metaOrOpts)) {
    return {
      meta: metaOrOpts.meta ?? {},
      semantics: metaOrOpts.semantics,
      schema: metaOrOpts.schema,
      schemaSeverity: metaOrOpts.schemaSeverity,
      jsonSchema: metaOrOpts.jsonSchema,
    };
  }
  return { meta: metaOrOpts ?? {}, semantics };
}
