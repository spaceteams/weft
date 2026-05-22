import { describe, expect, it } from "vitest";
import type { FrozenEvaluatedDraft } from "../draft/freeze/freeze-evaluated-draft";
import type { FrozenModel } from "../model/freeze-model";
import { type JsonSchemaValidator, validateFrozenDraft } from "./validate-frozen-draft";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function minimalFrozenModel(overrides?: Partial<FrozenModel>): FrozenModel {
  return {
    inputKeys: [],
    orderedRuleTargets: [],
    depsByTarget: {},
    dependentsByKey: {},
    keyMeta: {},
    ruleMeta: {},
    ruleSpecs: {},
    ...overrides,
  };
}

function minimalFrozenDraft(overrides?: Partial<FrozenEvaluatedDraft>): FrozenEvaluatedDraft {
  return {
    version: 1,
    draftId: "test",
    snapshot: {
      modelFingerprint: "m",
      baseFingerprint: "b",
      overlayFingerprint: "o",
      analysisFingerprint: "a",
      createdAt: "2024-01-01T00:00:00.000Z",
    },
    base: {},
    overlay: {},
    effective: {},
    values: {},
    deltas: [],
    trace: [],
    frozenAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const passingValidator: JsonSchemaValidator = () => ({ valid: true });

const failingValidator: JsonSchemaValidator = () => ({
  valid: false,
  errors: [{ message: "invalid value" }],
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("validateFrozenDraft", () => {
  it("returns valid when no jsonSchemas field exists on frozen model", () => {
    const model = minimalFrozenModel();
    const draft = minimalFrozenDraft({ overlay: { age: 42 } });

    const result = validateFrozenDraft(model, draft, passingValidator);

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("returns valid when overlay values pass their schemas", () => {
    const model = minimalFrozenModel({
      jsonSchemas: {
        age: { schema: { type: "number" } },
      },
    });
    const draft = minimalFrozenDraft({ overlay: { age: 25 } });

    const result = validateFrozenDraft(model, draft, passingValidator);

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("returns issues when overlay values fail their schemas", () => {
    const model = minimalFrozenModel({
      jsonSchemas: {
        age: { schema: { type: "number", minimum: 0 } },
      },
    });
    const draft = minimalFrozenDraft({ overlay: { age: -5 } });

    const validator: JsonSchemaValidator = () => ({
      valid: false,
      errors: [{ message: "must be >= 0", path: "/minimum" }],
    });

    const result = validateFrozenDraft(model, draft, validator);

    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      key: "age",
      message: "must be >= 0",
      severity: "error",
      path: ["/minimum"],
    });
    expect(result.errorKeys.has("age")).toBe(true);
  });

  it("only validates keys present in the overlay (keys not in overlay are skipped)", () => {
    const schemas: Record<string, unknown> = {};
    const validator: JsonSchemaValidator = (schema, _value) => {
      schemas[JSON.stringify(schema)] = true;
      return { valid: true };
    };

    const model = minimalFrozenModel({
      jsonSchemas: {
        age: { schema: { type: "number" } },
        name: { schema: { type: "string" } },
      },
    });
    // Only "age" is in the overlay; "name" should not be validated
    const draft = minimalFrozenDraft({ overlay: { age: 30 } });

    validateFrozenDraft(model, draft, validator);

    // Validator should have been called once (only for "age")
    expect(Object.keys(schemas)).toHaveLength(1);
  });

  it("skips overlay keys that don't have a jsonSchema entry", () => {
    let callCount = 0;
    const validator: JsonSchemaValidator = () => {
      callCount++;
      return { valid: true };
    };

    const model = minimalFrozenModel({
      jsonSchemas: {
        age: { schema: { type: "number" } },
      },
    });
    // "unknown_field" has no jsonSchema entry
    const draft = minimalFrozenDraft({
      overlay: { age: 30, unknown_field: "hello" },
    });

    validateFrozenDraft(model, draft, validator);

    // Only "age" should trigger validation
    expect(callCount).toBe(1);
  });

  it("uses the severity from the schema entry (default 'error')", () => {
    const model = minimalFrozenModel({
      jsonSchemas: {
        age: { schema: { type: "number" } },
      },
    });
    const draft = minimalFrozenDraft({ overlay: { age: "not a number" } });

    const result = validateFrozenDraft(model, draft, failingValidator);

    expect(result.issues[0]!.severity).toBe("error");
    expect(result.errorKeys.has("age")).toBe(true);
  });

  it("uses 'warning' severity when configured", () => {
    const model = minimalFrozenModel({
      jsonSchemas: {
        age: { schema: { type: "number" }, severity: "warning" },
      },
    });
    const draft = minimalFrozenDraft({ overlay: { age: "not a number" } });

    const result = validateFrozenDraft(model, draft, failingValidator);

    // "valid" should be true because warnings don't affect validity
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.severity).toBe("warning");
    expect(result.warningKeys.has("age")).toBe(true);
    expect(result.errorKeys.has("age")).toBe(false);
  });

  it("handles validator returning no errors array (just valid: false)", () => {
    const model = minimalFrozenModel({
      jsonSchemas: {
        age: { schema: { type: "number" } },
      },
    });
    const draft = minimalFrozenDraft({ overlay: { age: "bad" } });

    const validator: JsonSchemaValidator = () => ({ valid: false });

    const result = validateFrozenDraft(model, draft, validator);

    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      key: "age",
      message: "Value does not match schema",
      severity: "error",
    });
  });

  describe("cross-field constraints", () => {
    it("validates constraints with jsonSchema", () => {
      const model = minimalFrozenModel({
        constraints: [
          {
            name: "age-range",
            affectedKeys: ["minAge", "maxAge"],
            jsonSchema: {
              type: "object",
              properties: {
                minAge: { type: "number" },
                maxAge: { type: "number" },
              },
            },
          },
        ],
      });
      const draft = minimalFrozenDraft({
        effective: { minAge: 10, maxAge: 5 },
      });

      const validator: JsonSchemaValidator = () => ({
        valid: false,
        errors: [{ message: "maxAge must be >= minAge" }],
      });

      const result = validateFrozenDraft(model, draft, validator);

      expect(result.valid).toBe(false);
      expect(result.issues).toHaveLength(2);
      expect(result.issues[0]).toMatchObject({
        key: "minAge",
        message: "maxAge must be >= minAge",
        severity: "error",
      });
      expect(result.issues[1]).toMatchObject({
        key: "maxAge",
        message: "maxAge must be >= minAge",
        severity: "error",
      });
    });

    it("skips constraints without a jsonSchema field", () => {
      let callCount = 0;
      const validator: JsonSchemaValidator = () => {
        callCount++;
        return { valid: true };
      };

      const model = minimalFrozenModel({
        constraints: [
          {
            name: "server-only",
            affectedKeys: ["a", "b"],
            // no jsonSchema
          },
        ],
      });
      const draft = minimalFrozenDraft({ effective: { a: 1, b: 2 } });

      validateFrozenDraft(model, draft, validator);

      expect(callCount).toBe(0);
    });

    it("attributes constraint failures to all affectedKeys", () => {
      const model = minimalFrozenModel({
        constraints: [
          {
            name: "mutual-exclusion",
            affectedKeys: ["optionA", "optionB", "optionC"],
            jsonSchema: { type: "object" },
          },
        ],
      });
      const draft = minimalFrozenDraft({
        effective: { optionA: true, optionB: true, optionC: false },
      });

      const validator: JsonSchemaValidator = () => ({
        valid: false,
        errors: [{ message: "only one option allowed" }],
      });

      const result = validateFrozenDraft(model, draft, validator);

      expect(result.issues).toHaveLength(3);
      const keys = result.issues.map((i) => i.key);
      expect(keys).toContain("optionA");
      expect(keys).toContain("optionB");
      expect(keys).toContain("optionC");
    });

    it("uses constraint severity when specified", () => {
      const model = minimalFrozenModel({
        constraints: [
          {
            name: "soft-check",
            affectedKeys: ["x"],
            severity: "warning",
            jsonSchema: { type: "object" },
          },
        ],
      });
      const draft = minimalFrozenDraft({ effective: { x: 1 } });

      const validator: JsonSchemaValidator = () => ({
        valid: false,
        errors: [{ message: "soft constraint failed" }],
      });

      const result = validateFrozenDraft(model, draft, validator);

      expect(result.valid).toBe(true);
      expect(result.issues[0]!.severity).toBe("warning");
      expect(result.warningKeys.has("x")).toBe(true);
    });

    it("handles constraint validator returning no errors array", () => {
      const model = minimalFrozenModel({
        constraints: [
          {
            name: "fail-no-details",
            affectedKeys: ["key1", "key2"],
            jsonSchema: { type: "object" },
          },
        ],
      });
      const draft = minimalFrozenDraft({ effective: { key1: 1, key2: 2 } });

      const validator: JsonSchemaValidator = () => ({ valid: false });

      const result = validateFrozenDraft(model, draft, validator);

      expect(result.valid).toBe(false);
      expect(result.issues).toHaveLength(2);
      expect(result.issues[0]).toMatchObject({
        key: "key1",
        message: 'Constraint "fail-no-details" failed',
      });
      expect(result.issues[1]).toMatchObject({
        key: "key2",
        message: 'Constraint "fail-no-details" failed',
      });
    });

    it("reads constraint values from effective first, then falls back to values", () => {
      let receivedValue: unknown;
      const validator: JsonSchemaValidator = (_schema, value) => {
        receivedValue = value;
        return { valid: true };
      };

      const model = minimalFrozenModel({
        constraints: [
          {
            name: "check",
            affectedKeys: ["a", "b"],
            jsonSchema: { type: "object" },
          },
        ],
      });
      const draft = minimalFrozenDraft({
        effective: { a: "from-effective" },
        values: { b: "from-values" },
      });

      validateFrozenDraft(model, draft, validator);

      expect(receivedValue).toEqual({
        a: "from-effective",
        b: "from-values",
      });
    });
  });

  it("result is always synchronous (never a Promise)", () => {
    const model = minimalFrozenModel({
      jsonSchemas: {
        age: { schema: { type: "number" } },
      },
    });
    const draft = minimalFrozenDraft({ overlay: { age: 25 } });

    const result = validateFrozenDraft(model, draft, passingValidator);

    // The result should be a plain object, not a thenable/Promise
    expect(result).not.toBeInstanceOf(Promise);
    expect(typeof (result as unknown as Record<string, unknown>).then).not.toBe("function");
    expect(result.valid).toBe(true);
  });
});
