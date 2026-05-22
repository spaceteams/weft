import type { StandardSchemaV1 } from "@standard-schema/spec";
import { describe, expect, it } from "vitest";
import { evaluate } from "../evaluate";
import { key } from "../key";
import { compileModel } from "../model/compile-model";
import { createModel } from "../model/create-model";
import { rule } from "../rule";
import { constraint } from "./constraint";
import { validateDraft } from "./validate-draft";
import { validateEvaluation } from "./validate-evaluation";
import { validateFacts } from "./validate-facts";
import { validateOverlay } from "./validate-overlay";
import { validateSync } from "./validate-sync";
import type { ValidationResult } from "./validation-result";

// ── Helpers ──────────────────────────────────────────────────────────────────

function syncSchema<T>(
  validate: (value: unknown) => StandardSchemaV1.Result<T>,
): StandardSchemaV1<unknown, T> {
  return {
    "~standard": { version: 1, vendor: "test", validate },
  };
}

function asyncSchema<T>(
  validate: (value: unknown) => StandardSchemaV1.Result<T>,
): StandardSchemaV1<unknown, T> {
  return {
    "~standard": {
      version: 1,
      vendor: "test-async",
      validate: (value) => Promise.resolve(validate(value)),
    },
  };
}

const numberSchema = syncSchema<number>((value) => {
  if (typeof value === "number") return { value };
  return { issues: [{ message: "Expected a number" }] };
});

const positiveSchema = syncSchema<number>((value) => {
  if (typeof value === "number" && value > 0) return { value };
  if (typeof value !== "number") return { issues: [{ message: "Expected a number" }] };
  return { issues: [{ message: "Must be positive" }] };
});

function buildTestModel() {
  const a = key<number>("a");
  const b = key<number>("b");
  const result = key<number>("result");

  const m = createModel();
  m.input(a, { schema: positiveSchema });
  m.input(b, { schema: numberSchema });
  m.rule(
    rule({
      target: result,
      deps: [a, b],
      spec: { type: "sum" },
      eval: (get) => ({ output: get(a) + get(b) }),
    }),
  );

  const compiled = compileModel(m.build());
  if (!compiled.ok) throw new Error("Model compilation failed");
  return { model: compiled.model, a, b, result };
}

// ── validateFacts ────────────────────────────────────────────────────────────

describe("validateFacts", () => {
  it("returns valid when all values pass", () => {
    const { model } = buildTestModel();
    const result = validateFacts(model, { a: 5, b: 10 });
    expect(result).not.toBeInstanceOf(Promise);
    const r = result as ValidationResult;
    expect(r.valid).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  it("returns issues when a value fails", () => {
    const { model } = buildTestModel();
    const result = validateFacts(model, { a: -1, b: 10 }) as ValidationResult;
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].key).toBe("a");
    expect(result.issues[0].message).toBe("Must be positive");
    expect(result.issues[0].severity).toBe("error");
    expect(result.errorKeys).toEqual(new Set(["a"]));
  });

  it("returns multiple issues for multiple invalid values", () => {
    const { model } = buildTestModel();
    const result = validateFacts(model, { a: "not a number", b: "also bad" }) as ValidationResult;
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(2);
    expect(result.errorKeys).toEqual(new Set(["a", "b"]));
  });

  it("skips keys without schemas", () => {
    const x = key<number>("x");
    const m = createModel();
    m.input(x); // no schema
    const compiled = compileModel(m.build());
    if (!compiled.ok) throw new Error("fail");

    const result = validateFacts(compiled.model, { x: "anything" }) as ValidationResult;
    expect(result.valid).toBe(true);
  });

  it("handles async schemas", async () => {
    const x = key<number>("x");
    const m = createModel();
    m.input(x, {
      schema: asyncSchema<number>((v) => {
        if (typeof v === "number") return { value: v };
        return { issues: [{ message: "Not a number" }] };
      }),
    });
    const compiled = compileModel(m.build());
    if (!compiled.ok) throw new Error("fail");

    const result = validateFacts(compiled.model, { x: "bad" });
    expect(result).toBeInstanceOf(Promise);
    const r = await result;
    expect(r.valid).toBe(false);
    expect(r.issues[0].key).toBe("x");
  });

  it("passes validation context through", () => {
    const x = key<number>("x");
    let receivedOptions: unknown;

    // Standard Schema validate signature has (value, options?)
    // We need to verify context flows through libraryOptions
    const contextAwareSchema: StandardSchemaV1<unknown, number> = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: (value, options) => {
          receivedOptions = options;
          return { value: value as number };
        },
      },
    };

    const m = createModel();
    m.input(x, { schema: contextAwareSchema });
    const compiled = compileModel(m.build());
    if (!compiled.ok) throw new Error("fail");

    validateFacts(compiled.model, { x: 42 }, { phase: "submit" });
    expect(receivedOptions).toEqual({ libraryOptions: { phase: "submit" } });
  });

  it("applies schema severity as default", () => {
    const x = key<number>("x");
    const warnSchema = syncSchema<number>((_value) => {
      return { issues: [{ message: "heads up" }] };
    });

    const m = createModel();
    m.input(x, { schema: warnSchema, schemaSeverity: "warning" });
    const compiled = compileModel(m.build());
    if (!compiled.ok) throw new Error("fail");

    const result = validateFacts(compiled.model, { x: 42 }) as ValidationResult;
    expect(result.valid).toBe(true); // warnings don't make it invalid
    expect(result.issues[0].severity).toBe("warning");
    expect(result.warningKeys).toEqual(new Set(["x"]));
  });
});

// ── validateOverlay ──────────────────────────────────────────────────────────

describe("validateOverlay", () => {
  it("validates only keys in the overlay", () => {
    const { model } = buildTestModel();
    // Only "a" is in overlay — "b" is not validated
    const result = validateOverlay(model, { a: -5 }) as ValidationResult;
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].key).toBe("a");
  });

  it("returns valid for empty overlay", () => {
    const { model } = buildTestModel();
    const result = validateOverlay(model, {}) as ValidationResult;
    expect(result.valid).toBe(true);
  });

  it("ignores overlay keys without schemas", () => {
    const { model } = buildTestModel();
    // "result" is a rule target, not an input — but even if someone puts it in overlay
    // it won't have an input schema (it has no schema at all in this model)
    const result = validateOverlay(model, { result: "garbage" }) as ValidationResult;
    expect(result.valid).toBe(true);
  });
});

// ── validateDraft ────────────────────────────────────────────────────────────

describe("validateDraft", () => {
  it("validates both base and overlay", () => {
    const { model } = buildTestModel();
    const draft = {
      draftId: "test-1",
      base: { a: -1, b: 10 },
      overlay: { b: "not a number" },
    };
    const result = validateDraft(model, draft) as ValidationResult;
    expect(result.valid).toBe(false);
    // a fails in base, b fails in overlay
    expect(result.errorKeys).toEqual(new Set(["a", "b"]));
    expect(result.issues).toHaveLength(2);
  });

  it("returns valid when both pass", () => {
    const { model } = buildTestModel();
    const draft = {
      draftId: "test-2",
      base: { a: 5, b: 10 },
      overlay: { a: 10 },
    };
    const result = validateDraft(model, draft) as ValidationResult;
    expect(result.valid).toBe(true);
  });

  it("handles async schemas", async () => {
    const x = key<number>("x");
    const m = createModel();
    m.input(x, {
      schema: asyncSchema<number>((v) => {
        if (typeof v === "number") return { value: v };
        return { issues: [{ message: "bad" }] };
      }),
    });
    const compiled = compileModel(m.build());
    if (!compiled.ok) throw new Error("fail");

    const result = validateDraft(compiled.model, {
      draftId: "async-test",
      base: { x: "bad" },
      overlay: { x: "also bad" },
    });
    expect(result).toBeInstanceOf(Promise);
    const r = await result;
    expect(r.valid).toBe(false);
    expect(r.issues).toHaveLength(2);
  });
});

// ── validateEvaluation ───────────────────────────────────────────────────────

describe("validateEvaluation", () => {
  it("validates derived values against rule schemas", () => {
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
      { schema: positiveSchema, schemaSeverity: "warning" },
    );

    const compiled = compileModel(m.build());
    if (!compiled.ok) throw new Error("fail");

    const evalResult = evaluate(compiled.model, { a: -5 });
    const validation = validateEvaluation(compiled.model, evalResult) as ValidationResult;

    expect(validation.valid).toBe(true); // warnings don't fail
    expect(validation.issues).toHaveLength(1);
    expect(validation.issues[0].key).toBe("result");
    expect(validation.issues[0].severity).toBe("warning");
    expect(validation.issues[0].message).toBe("Must be positive");
  });

  it("runs model constraints", () => {
    const a = key<number>("a");
    const b = key<number>("b");

    const m = createModel();
    m.input(a);
    m.input(b);
    m.constraint(
      constraint({
        name: "sum-max",
        deps: [a, b],
        severity: "error",
        validate: (get) => {
          const sum = get(a) + get(b);
          if (sum > 100) return { message: "Sum exceeds 100" };
          return null;
        },
      }),
    );

    const compiled = compileModel(m.build());
    if (!compiled.ok) throw new Error("fail");

    const evalResult = evaluate(compiled.model, { a: 60, b: 50 });
    const validation = validateEvaluation(compiled.model, evalResult) as ValidationResult;

    expect(validation.valid).toBe(false);
    expect(validation.issues).toHaveLength(2); // one per affected key (a and b)
    expect(validation.errorKeys).toEqual(new Set(["a", "b"]));
    expect(validation.issues[0].message).toBe("Sum exceeds 100");
  });

  it("constraint passes when condition is met", () => {
    const a = key<number>("a");
    const b = key<number>("b");

    const m = createModel();
    m.input(a);
    m.input(b);
    m.constraint(
      constraint({
        name: "sum-max",
        deps: [a, b],
        validate: (get) => {
          if (get(a) + get(b) > 100) return { message: "Too high" };
          return null;
        },
      }),
    );

    const compiled = compileModel(m.build());
    if (!compiled.ok) throw new Error("fail");

    const evalResult = evaluate(compiled.model, { a: 30, b: 20 });
    const validation = validateEvaluation(compiled.model, evalResult) as ValidationResult;
    expect(validation.valid).toBe(true);
    expect(validation.issues).toHaveLength(0);
  });

  it("skips constraint when deps are missing", () => {
    const a = key<number>("a");
    const b = key<number>("b");

    const m = createModel();
    m.input(a);
    m.input(b);
    m.constraint(
      constraint({
        name: "needs-both",
        deps: [a, b],
        validate: (get) => {
          if (get(a) + get(b) > 100) return { message: "Too high" };
          return null;
        },
      }),
    );

    const compiled = compileModel(m.build());
    if (!compiled.ok) throw new Error("fail");

    // Evaluate in lenient mode with missing input
    const evalResult = evaluate(compiled.model, { a: 200 }, "lenient");
    const validation = validateEvaluation(compiled.model, evalResult) as ValidationResult;
    // Constraint skipped because "b" is missing
    expect(validation.valid).toBe(true);
  });

  it("constraint with affectedKeys targets specific keys", () => {
    const a = key<number>("a");
    const b = key<number>("b");
    const c = key<number>("c");

    const m = createModel();
    m.input(a);
    m.input(b);
    m.input(c);
    m.constraint(
      constraint({
        name: "specific-target",
        deps: [a, b, c],
        validate: (get) => {
          if (get(a) > 50) return { message: "a too high", affectedKeys: ["a"] };
          return null;
        },
      }),
    );

    const compiled = compileModel(m.build());
    if (!compiled.ok) throw new Error("fail");

    const evalResult = evaluate(compiled.model, { a: 60, b: 10, c: 5 });
    const validation = validateEvaluation(compiled.model, evalResult) as ValidationResult;
    expect(validation.issues).toHaveLength(1);
    expect(validation.issues[0].key).toBe("a");
    expect(validation.errorKeys).toEqual(new Set(["a"]));
  });

  it("catches throwing constraints gracefully", () => {
    const a = key<number>("a");

    const m = createModel();
    m.input(a);
    m.constraint(
      constraint({
        name: "throws",
        deps: [a],
        validate: () => {
          throw new Error("kaboom");
        },
      }),
    );

    const compiled = compileModel(m.build());
    if (!compiled.ok) throw new Error("fail");

    const evalResult = evaluate(compiled.model, { a: 1 });
    const validation = validateEvaluation(compiled.model, evalResult) as ValidationResult;
    expect(validation.valid).toBe(false);
    expect(validation.issues[0].message).toContain("throws");
    expect(validation.issues[0].severity).toBe("error");
  });
});

// ── validateSync ─────────────────────────────────────────────────────────────

describe("validateSync", () => {
  it("returns the result when sync", () => {
    const { model } = buildTestModel();
    const result = validateFacts(model, { a: 5, b: 10 });
    const synced = validateSync(result);
    expect(synced.valid).toBe(true);
  });

  it("throws when result is a Promise", () => {
    expect(() =>
      validateSync(
        Promise.resolve({
          valid: true,
          issues: [],
          affectedKeys: new Set(),
          errorKeys: new Set(),
          warningKeys: new Set(),
        }),
      ),
    ).toThrow("validateSync");
  });
});
