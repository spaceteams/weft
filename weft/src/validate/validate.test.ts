import type { StandardSchemaV1 } from "@standard-schema/spec";
import { describe, expect, it } from "vitest";
import { key } from "../key";
import { compileModel } from "../model/compile-model";
import { createModel } from "../model/create-model";
import { rule } from "../rule";
import { constraint } from "./constraint";
import { keySchema } from "./key-schema";
import { failedResult, mergeResults, validResult } from "./validation-result";

// A minimal mock StandardSchemaV1 for testing
function mockSchema<T>(
  validate: (value: unknown) => StandardSchemaV1.Result<T>,
): StandardSchemaV1<unknown, T> {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate,
    },
  };
}

describe("validation-result", () => {
  it("validResult returns an empty valid result", () => {
    const result = validResult();
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.affectedKeys.size).toBe(0);
    expect(result.errorKeys.size).toBe(0);
    expect(result.warningKeys.size).toBe(0);
  });

  it("failedResult builds sets from issues", () => {
    const result = failedResult([
      { key: "a", message: "bad value", severity: "error" },
      { key: "b", message: "maybe wrong", severity: "warning" },
      { key: "a", message: "also wrong", severity: "warning" },
      { key: "c", message: "fyi", severity: "info" },
    ]);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(4);
    expect(result.affectedKeys).toEqual(new Set(["a", "b", "c"]));
    expect(result.errorKeys).toEqual(new Set(["a"]));
    expect(result.warningKeys).toEqual(new Set(["b", "a"]));
  });

  it("failedResult is valid when only warnings/info", () => {
    const result = failedResult([
      { key: "x", message: "heads up", severity: "warning" },
      { key: "y", message: "info", severity: "info" },
    ]);
    expect(result.valid).toBe(true);
    expect(result.affectedKeys).toEqual(new Set(["x", "y"]));
    expect(result.errorKeys.size).toBe(0);
    expect(result.warningKeys).toEqual(new Set(["x"]));
  });

  it("mergeResults combines issues from multiple results", () => {
    const r1 = failedResult([{ key: "a", message: "err", severity: "error" }]);
    const r2 = failedResult([{ key: "b", message: "warn", severity: "warning" }]);
    const merged = mergeResults(r1, r2);
    expect(merged.valid).toBe(false);
    expect(merged.issues).toHaveLength(2);
    expect(merged.affectedKeys).toEqual(new Set(["a", "b"]));
  });

  it("mergeResults with all valid returns valid", () => {
    const merged = mergeResults(validResult(), validResult());
    expect(merged.valid).toBe(true);
    expect(merged.issues).toHaveLength(0);
  });
});

describe("key-schema", () => {
  it("creates a KeySchema from a key and a standard schema", () => {
    const k = key<number>("amount");
    const schema = mockSchema<number>((value) => {
      if (typeof value === "number") return { value };
      return { issues: [{ message: "Expected number" }] };
    });

    const ks = keySchema(k, schema);
    expect(ks.key).toBe(k);
    expect(ks.schema).toBe(schema);
    expect(ks.severity).toBeUndefined();
  });

  it("accepts a custom severity", () => {
    const k = key<number>("amount");
    const schema = mockSchema<number>((value) => ({ value: value as number }));

    const ks = keySchema(k, schema, "warning");
    expect(ks.severity).toBe("warning");
  });
});

describe("constraint", () => {
  it("creates a constraint definition", () => {
    const a = key<number>("a");
    const b = key<number>("b");

    const c = constraint({
      name: "sum-check",
      deps: [a, b],
      severity: "error",
      validate: (get) => {
        const sum = get(a) + get(b);
        if (sum > 100) return { message: "Sum exceeds 100" };
        return null;
      },
    });

    expect(c.name).toBe("sum-check");
    expect(c.deps).toEqual([a, b]);
    expect(c.severity).toBe("error");
  });
});

describe("createModel with schemas and constraints", () => {
  it("accepts schema via options object on input", () => {
    const amount = key<number>("amount");
    const schema = mockSchema<number>((value) => ({ value: value as number }));

    const m = createModel();
    m.input(amount, { meta: { label: "Amount" }, schema });
    const model = m.build();

    expect(model.schemas.get("amount")).toBeDefined();
    expect(model.schemas.get("amount")!.schema).toBe(schema);
    expect(model.schemas.get("amount")!.severity).toBeUndefined();
  });

  it("accepts schema with severity on rule", () => {
    const a = key<number>("a");
    const result = key<number>("result");
    const schema = mockSchema<number>((value) => ({ value: value as number }));

    const m = createModel();
    m.input(a, { label: "A" });
    m.rule(
      rule({
        target: result,
        deps: [a],
        spec: { type: "identity" },
        eval: (get) => ({ output: get(a) }),
      }),
      { schema, schemaSeverity: "warning" },
    );

    const model = m.build();
    expect(model.schemas.get("result")).toBeDefined();
    expect(model.schemas.get("result")!.severity).toBe("warning");
  });

  it("backward-compatible: positional args still work", () => {
    const x = key<number>("x");
    const m = createModel();
    m.input(x, { label: "X" });
    const model = m.build();
    expect(model.keyMeta.get("x")).toEqual({ label: "X" });
    expect(model.schemas.size).toBe(0);
  });

  it("registers constraints on the model", () => {
    const a = key<number>("a");
    const b = key<number>("b");

    const m = createModel();
    m.input(a, { label: "A" });
    m.input(b, { label: "B" });
    m.constraint(
      constraint({
        name: "sum-check",
        deps: [a, b],
        validate: (get) => {
          if (get(a) + get(b) > 100) return { message: "Too high" };
          return null;
        },
      }),
    );

    const model = m.build();
    expect(model.constraints).toHaveLength(1);
    expect(model.constraints[0].name).toBe("sum-check");
  });

  it("compileModel passes schemas and constraints through", () => {
    const a = key<number>("a");
    const b = key<number>("b");
    const schema = mockSchema<number>((value) => ({ value: value as number }));

    const m = createModel();
    m.input(a, { schema });
    m.input(b);
    m.constraint(
      constraint({
        name: "check",
        deps: [a, b],
        validate: () => null,
      }),
    );

    const result = compileModel(m.build());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.model.schemas.get("a")).toBeDefined();
    expect(result.model.schemas.get("a")!.schema).toBe(schema);
    expect(result.model.constraints).toHaveLength(1);
  });

  it("compileModel warns on constraint with unknown dep", () => {
    const a = key<number>("a");
    const unknown = key<number>("unknown_key");

    const m = createModel();
    m.input(a);
    m.constraint(
      constraint({
        name: "bad-constraint",
        deps: [a, unknown],
        validate: () => null,
      }),
    );

    const result = compileModel(m.build());
    // Should still compile (warning, not error)
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].code).toBe("MISSING_DEPENDENCY");
    expect(result.issues[0].level).toBe("warn");
    expect(result.issues[0].message).toContain("bad-constraint");
    expect(result.issues[0].message).toContain("unknown_key");
  });
});

describe("createModel key metadata for rules", () => {
  it("rule shorthand populates keyMeta with all KeyMeta fields", () => {
    const a = key<number>("a");
    const result = key<number>("result");

    const m = createModel();
    m.input(a);
    m.rule(
      rule({
        target: result,
        deps: [a],
        spec: { type: "identity" },
        eval: (get) => ({ output: get(a) }),
      }),
      { label: "Result", description: "The result", unit: "\u20ac", semanticType: "currency" },
    );

    const model = m.build();
    expect(model.keyMeta.get("result")).toEqual({
      label: "Result",
      description: "The result",
      unit: "\u20ac",
      semanticType: "currency",
    });
  });

  it("m.meta() sets keyMeta for any key", () => {
    const a = key<number>("a");
    const result = key<number>("result");

    const m = createModel();
    m.input(a);
    m.rule(
      rule({
        target: result,
        deps: [a],
        spec: { type: "identity" },
        eval: (get) => ({ output: get(a) }),
      }),
    );
    m.meta(result, { unit: "\u20ac", semanticType: "currency" });

    const model = m.build();
    expect(model.keyMeta.get("result")).toEqual({ unit: "\u20ac", semanticType: "currency" });
  });

  it("m.meta() merges with existing keyMeta from rule shorthand", () => {
    const a = key<number>("a");
    const result = key<number>("result");

    const m = createModel();
    m.input(a);
    m.rule(
      rule({
        target: result,
        deps: [a],
        spec: { type: "identity" },
        eval: (get) => ({ output: get(a) }),
      }),
      { label: "Result" },
    );
    m.meta(result, { unit: "\u20ac", semanticType: "currency" });

    const model = m.build();
    expect(model.keyMeta.get("result")).toEqual({
      label: "Result",
      unit: "\u20ac",
      semanticType: "currency",
    });
  });

  it("m.meta() merges with existing keyMeta from input", () => {
    const a = key<number>("a");

    const m = createModel();
    m.input(a, { label: "A" });
    m.meta(a, { unit: "kg", group: "WEIGHTS" });

    const model = m.build();
    expect(model.keyMeta.get("a")).toEqual({ label: "A", unit: "kg", group: "WEIGHTS" });
  });

  it("RuleOptions.meta accepts full KeyMeta", () => {
    const a = key<number>("a");
    const result = key<number>("result");
    const schema = mockSchema<number>((value) => ({ value: value as number }));

    const m = createModel();
    m.input(a);
    m.rule(
      rule({
        target: result,
        deps: [a],
        spec: { type: "identity" },
        eval: (get) => ({ output: get(a) }),
      }),
      { meta: { label: "Result", unit: "\u20ac", semanticType: "currency" }, schema },
    );

    const model = m.build();
    expect(model.keyMeta.get("result")).toEqual({
      label: "Result",
      unit: "\u20ac",
      semanticType: "currency",
    });
    expect(model.schemas.get("result")).toBeDefined();
  });
});
