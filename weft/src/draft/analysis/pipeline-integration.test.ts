import type { StandardSchemaV1 } from "@standard-schema/spec";
import { describe, expect, it } from "vitest";
import { key } from "../../key";
import { compileModel } from "../../model/compile-model";
import { createModel } from "../../model/create-model";
import { rule } from "../../rule";
import { constraint } from "../../validate/constraint";
import { evaluateDraft } from "../evaluate-draft";
import { normalizeDraft } from "../normalize-draft";
import { analyzeDraft } from "./analyze-draft";

// ── Helpers ──────────────────────────────────────────────────────────────────

function syncSchema<T>(
  validate: (value: unknown) => StandardSchemaV1.Result<T>,
): StandardSchemaV1<unknown, T> {
  return { "~standard": { version: 1, vendor: "test", validate } };
}

const positiveNumber = syncSchema<number>((value) => {
  if (typeof value === "number" && value > 0) return { value };
  if (typeof value !== "number") return { issues: [{ message: "Expected a number" }] };
  return { issues: [{ message: "Must be positive" }] };
});

const numberSchema = syncSchema<number>((value) => {
  if (typeof value === "number") return { value };
  return { issues: [{ message: "Expected a number" }] };
});

function buildModel() {
  const a = key<number>("a");
  const b = key<number>("b");
  const sum = key<number>("sum");

  const m = createModel();
  m.input(a, { schema: positiveNumber });
  m.input(b, { schema: numberSchema });
  m.rule(
    rule({
      target: sum,
      deps: [a, b],
      spec: { type: "sum" },
      eval: (get) => ({ output: get(a) + get(b) }),
    }),
    { schema: positiveNumber, schemaSeverity: "warning" },
  );
  m.constraint(
    constraint({
      name: "sum-max",
      deps: [a, b],
      severity: "error",
      validate: (get) => {
        if (get(a) + get(b) > 100) return { message: "Sum exceeds 100" };
        return null;
      },
    }),
  );

  const compiled = compileModel(m.build());
  if (!compiled.ok) throw new Error("Model compilation failed");
  return { model: compiled.model, a, b, sum };
}

// ── normalizeDraft with validation ───────────────────────────────────────────

describe("normalizeDraft with validation", () => {
  it("returns sync NormalizedDraft without validation option", () => {
    const { model } = buildModel();
    const result = normalizeDraft(model, {
      draftId: "d1",
      base: { a: -1, b: 5 },
      overlay: { a: 10 },
    });
    // Without options, always returns NormalizedDraft directly
    expect(result).toHaveProperty("draft");
    expect(result).toHaveProperty("issues");
    expect(result.issues).toHaveLength(0);
  });

  it("appends validation issues when validate: true", () => {
    const { model } = buildModel();
    const result = normalizeDraft(
      model,
      {
        draftId: "d1",
        base: { a: -1, b: "bad" },
        overlay: { a: -5 },
      },
      { validate: true },
    );
    // With sync schemas, should not be a Promise
    expect(result).not.toBeInstanceOf(Promise);
    const normalized = result as Awaited<typeof result>;

    // Should have validation issues for: a (base), b (base), a (overlay)
    const validationIssues = normalized.issues.filter(
      (i) => i.message !== 'Key "a" is not an input key and will be ignored',
    );
    expect(validationIssues.length).toBeGreaterThanOrEqual(2);
    expect(validationIssues.some((i) => i.key === "a")).toBe(true);
    expect(validationIssues.some((i) => i.key === "b")).toBe(true);
  });

  it("still performs normalization (strip no-ops) alongside validation", () => {
    const { model } = buildModel();
    const result = normalizeDraft(
      model,
      {
        draftId: "d1",
        base: { a: 5, b: 10 },
        overlay: { a: 5 }, // same as base → should be stripped
      },
      { validate: true },
    );
    expect(result).not.toBeInstanceOf(Promise);
    const normalized = result as Awaited<typeof result>;
    expect(Object.keys(normalized.draft.overlay)).toHaveLength(0);
  });
});

// ── evaluateDraft with validation ────────────────────────────────────────────

describe("evaluateDraft with validation", () => {
  it("returns EvaluatedDraft without validation when using mode string", () => {
    const { model } = buildModel();
    const result = evaluateDraft(model, {
      draftId: "d1",
      base: { a: 5, b: 10 },
      overlay: { a: 20 },
    });
    expect(result.validation).toBeUndefined();
  });

  it("includes validation result when validate: true", () => {
    const { model } = buildModel();
    const result = evaluateDraft(
      model,
      {
        draftId: "d1",
        base: { a: 5, b: 10 },
        overlay: { a: 20 },
      },
      { validate: true },
    );
    expect(result).not.toBeInstanceOf(Promise);
    const evaluated = result as Awaited<typeof result>;
    expect(evaluated.validation).toBeDefined();
    expect(evaluated.validation!.valid).toBe(true);
  });

  it("catches input validation errors", () => {
    const { model } = buildModel();
    const result = evaluateDraft(
      model,
      {
        draftId: "d1",
        base: { a: -1, b: 10 },
        overlay: {},
      },
      { validate: true, mode: "lenient" },
    );
    expect(result).not.toBeInstanceOf(Promise);
    const evaluated = result as Awaited<typeof result>;
    expect(evaluated.validation!.valid).toBe(false);
    expect(evaluated.validation!.errorKeys.has("a")).toBe(true);
  });

  it("catches derived value warnings", () => {
    const { model } = buildModel();
    const result = evaluateDraft(
      model,
      {
        draftId: "d1",
        base: { a: 1, b: -10 }, // sum = -9, which fails positiveNumber
        overlay: {},
      },
      { validate: true },
    );
    expect(result).not.toBeInstanceOf(Promise);
    const evaluated = result as Awaited<typeof result>;
    // "sum" has a warning-level schema
    expect(evaluated.validation!.warningKeys.has("sum")).toBe(true);
  });

  it("catches constraint violations", () => {
    const { model } = buildModel();
    const result = evaluateDraft(
      model,
      {
        draftId: "d1",
        base: { a: 60, b: 50 }, // sum = 110 > 100
        overlay: {},
      },
      { validate: true },
    );
    expect(result).not.toBeInstanceOf(Promise);
    const evaluated = result as Awaited<typeof result>;
    expect(evaluated.validation!.valid).toBe(false);
    expect(evaluated.validation!.errorKeys.has("a")).toBe(true);
    expect(evaluated.validation!.errorKeys.has("b")).toBe(true);
    expect(evaluated.validation!.issues.some((i) => i.message === "Sum exceeds 100")).toBe(true);
  });
});

// ── analyzeDraft with validation ─────────────────────────────────────────────

describe("analyzeDraft with validation", () => {
  it("returns sync DraftAnalysis without validation", () => {
    const { model } = buildModel();
    const result = analyzeDraft(model, {
      draftId: "d1",
      base: { a: 5, b: 10 },
      overlay: { a: 20 },
    });
    expect(result).toHaveProperty("evaluated");
    expect(result).toHaveProperty("impact");
    expect(result.validation).toBeUndefined();
  });

  it("returns sync DraftAnalysis with mode string", () => {
    const { model } = buildModel();
    const result = analyzeDraft(
      model,
      { draftId: "d1", base: { a: 5, b: 10 }, overlay: { a: 20 } },
      "lenient",
    );
    expect(result).toHaveProperty("evaluated");
    expect(result.validation).toBeUndefined();
  });

  it("includes full validation in analysis when validate: true", () => {
    const { model } = buildModel();
    const result = analyzeDraft(
      model,
      {
        draftId: "d1",
        base: { a: 60, b: 50 },
        overlay: { a: 70 },
      },
      { validate: true },
    );
    expect(result).not.toBeInstanceOf(Promise);
    const analysis = result as Awaited<typeof result>;

    expect(analysis.validation).toBeDefined();
    // Constraint fires because 70 + 50 = 120 > 100
    expect(analysis.validation!.valid).toBe(false);
    expect(analysis.validation!.issues.some((i) => i.message === "Sum exceeds 100")).toBe(true);
  });

  it("normalization issues are separate from validation", () => {
    const { model } = buildModel();
    const result = analyzeDraft(
      model,
      {
        draftId: "d1",
        base: { a: 5, b: 10 },
        overlay: { unknown_key: 42, a: 20 },
      },
      { validate: true },
    );
    expect(result).not.toBeInstanceOf(Promise);
    const analysis = result as Awaited<typeof result>;

    // Normalization catches the unknown key
    expect(analysis.normalizationIssues.some((i) => i.key === "unknown_key")).toBe(true);
    // Validation is clean (valid inputs, valid derived values, constraint OK)
    expect(analysis.validation!.valid).toBe(true);
  });

  it("passes validation context through the pipeline", () => {
    const x = key<number>("x");
    let receivedContext: unknown;
    const contextSchema: StandardSchemaV1<unknown, number> = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: (value, options) => {
          receivedContext = options?.libraryOptions;
          return { value: value as number };
        },
      },
    };

    const m = createModel();
    m.input(x, { schema: contextSchema });
    const compiled = compileModel(m.build());
    if (!compiled.ok) throw new Error("fail");

    analyzeDraft(
      compiled.model,
      { draftId: "d1", base: { x: 1 }, overlay: {} },
      { validate: true, validationContext: { phase: "submit" } },
    );

    expect(receivedContext).toEqual({ phase: "submit" });
  });
});
