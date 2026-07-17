import {
  compileModelOrThrow,
  constraint,
  createModel,
  evaluate,
  evaluateDraft,
  key,
  rule,
  validateDraft,
  validateEvaluation,
  validateFacts,
  validateOverlay,
  validateSync,
} from "@spaceteams/weft";
import type { ValidationResult } from "@spaceteams/weft/validate";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

describe("validation with valibot schemas", () => {
  it("validates facts with valibot schemas", () => {
    const amount = key<number>("amount");
    const rate = key<number>("rate");

    const m = createModel();
    m.input(amount, { schema: v.pipe(v.number(), v.minValue(0)) });
    m.input(rate, { schema: v.pipe(v.number(), v.minValue(0), v.maxValue(1)) });

    const compiled = compileModelOrThrow(m.build());

    const result = validateFacts(compiled, { amount: 1000, rate: 0.05 }) as ValidationResult;
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("reports issues for invalid facts", () => {
    const amount = key<number>("amount");
    const rate = key<number>("rate");

    const m = createModel();
    m.input(amount, { schema: v.pipe(v.number(), v.minValue(0)) });
    m.input(rate, { schema: v.pipe(v.number(), v.minValue(0), v.maxValue(1)) });

    const compiled = compileModelOrThrow(m.build());

    const result = validateFacts(compiled, { amount: -100, rate: 1.5 }) as ValidationResult;
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(2);

    const amountIssue = result.issues.find((i) => i.key === "amount");
    expect(amountIssue).toBeDefined();
    expect(amountIssue!.severity).toBe("error");
    expect(amountIssue!.message).toContain("0");

    const rateIssue = result.issues.find((i) => i.key === "rate");
    expect(rateIssue).toBeDefined();
    expect(rateIssue!.severity).toBe("error");
    expect(rateIssue!.message).toContain("1");
  });

  it("validates overlay (partial validation)", () => {
    const amount = key<number>("amount");
    const rate = key<number>("rate");

    const m = createModel();
    m.input(amount, { schema: v.pipe(v.number(), v.minValue(0)) });
    m.input(rate, { schema: v.pipe(v.number(), v.minValue(0), v.maxValue(1)) });

    const compiled = compileModelOrThrow(m.build());

    // Only "rate" is in the overlay — "amount" is not validated
    const result = validateOverlay(compiled, { rate: 0.5 }) as ValidationResult;
    expect(result.valid).toBe(true);

    const invalid = validateOverlay(compiled, { rate: 2.0 }) as ValidationResult;
    expect(invalid.valid).toBe(false);
    expect(invalid.issues).toHaveLength(1);
    expect(invalid.issues[0].key).toBe("rate");
  });

  it("validates draft (base + overlay)", () => {
    const amount = key<number>("amount");
    const rate = key<number>("rate");

    const m = createModel();
    m.input(amount, { schema: v.pipe(v.number(), v.minValue(0)) });
    m.input(rate, { schema: v.pipe(v.number(), v.minValue(0), v.maxValue(1)) });

    const compiled = compileModelOrThrow(m.build());

    const draft = {
      draftId: "draft-1",
      base: { amount: -5, rate: 0.5 },
      overlay: { rate: 1.5 },
    };

    const result = validateDraft(compiled, draft) as ValidationResult;
    expect(result.valid).toBe(false);
    // amount fails in base, rate fails in overlay
    expect(result.errorKeys).toEqual(new Set(["amount", "rate"]));
    expect(result.issues).toHaveLength(2);
  });

  it("validates derived values after evaluation", () => {
    const a = key<number>("a");
    const b = key<number>("b");
    const total = key<number>("total");

    const m = createModel();
    m.input(a);
    m.input(b);
    m.rule(
      rule({
        target: total,
        deps: [a, b],
        spec: { type: "sum" },
        eval: (get) => ({ output: get(a) + get(b) }),
      }),
      { schema: v.pipe(v.number(), v.maxValue(100)), schemaSeverity: "warning" },
    );

    const compiled = compileModelOrThrow(m.build());

    const evalResult = evaluate(compiled, { a: 60, b: 50 });
    const validation = validateEvaluation(compiled, evalResult) as ValidationResult;

    // Warnings don't make it invalid
    expect(validation.valid).toBe(true);
    expect(validation.issues).toHaveLength(1);
    expect(validation.issues[0].key).toBe("total");
    expect(validation.issues[0].severity).toBe("warning");
    expect(validation.issues[0].message).toContain("100");
  });

  it("cross-field constraints with evaluation", () => {
    const interestRate = key<number>("interest_rate");
    const repaymentRate = key<number>("repayment_rate");

    const m = createModel();
    m.input(interestRate, { schema: v.pipe(v.number(), v.minValue(0), v.maxValue(1)) });
    m.input(repaymentRate, { schema: v.pipe(v.number(), v.minValue(0), v.maxValue(1)) });
    m.constraint(
      constraint({
        name: "rates-sum-check",
        deps: [interestRate, repaymentRate],
        severity: "error",
        validate: (get) => {
          const sum = get(interestRate) + get(repaymentRate);
          if (sum > 1) return { message: "Combined rates exceed 100%" };
          return null;
        },
      }),
    );

    const compiled = compileModelOrThrow(m.build());

    // Passing case
    const passing = evaluate(compiled, { interest_rate: 0.03, repayment_rate: 0.02 });
    const passResult = validateEvaluation(compiled, passing) as ValidationResult;
    expect(passResult.valid).toBe(true);

    // Failing case
    const failing = evaluate(compiled, { interest_rate: 0.6, repayment_rate: 0.5 });
    const failResult = validateEvaluation(compiled, failing) as ValidationResult;
    expect(failResult.valid).toBe(false);
    expect(failResult.issues[0].message).toBe("Combined rates exceed 100%");
    expect(failResult.errorKeys).toEqual(new Set(["interest_rate", "repayment_rate"]));
  });

  it("validation context flows to schemas", () => {
    const amount = key<number>("amount");
    let receivedContext: unknown;

    // A minimal StandardSchemaV1-compliant schema that captures context
    const contextAwareSchema = {
      "~standard": {
        version: 1 as const,
        vendor: "test" as string,
        validate: (value: unknown, options?: { libraryOptions?: unknown }) => {
          receivedContext = options?.libraryOptions;
          if (typeof value === "number") return { value };
          return { issues: [{ message: "Expected number" }] };
        },
      },
    };

    const m = createModel();
    m.input(amount, { schema: contextAwareSchema });

    const compiled = compileModelOrThrow(m.build());
    validateFacts(compiled, { amount: 42 }, { phase: "submit", strict: true });

    expect(receivedContext).toEqual({ phase: "submit", strict: true });
  });

  it("validateSync throws on async schemas", () => {
    const amount = key<number>("amount");

    // Valibot async schema using v.pipeAsync
    const asyncSchema = v.pipeAsync(
      v.number(),
      v.checkAsync(async (val) => val > 0, "positive"),
    );

    const m = createModel();
    m.input(amount, { schema: asyncSchema });

    const compiled = compileModelOrThrow(m.build());
    const result = validateFacts(compiled, { amount: 5 });

    expect(() => validateSync(result)).toThrow("validateSync");
  });

  it("end-to-end: define model → validate → evaluate → validate derived", () => {
    const principal = key<number>("principal");
    const rate = key<number>("rate");
    const years = key<number>("years");
    const interest = key<number>("interest");
    const totalRepayment = key<number>("total_repayment");

    const m = createModel();
    m.input(principal, { schema: v.pipe(v.number(), v.minValue(1000)) });
    m.input(rate, { schema: v.pipe(v.number(), v.minValue(0.001), v.maxValue(0.5)) });
    m.input(years, { schema: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50)) });

    m.rule(
      rule({
        target: interest,
        deps: [principal, rate, years],
        spec: { type: "simple-interest" },
        eval: (get) => ({ output: get(principal) * get(rate) * get(years) }),
      }),
    );

    m.rule(
      rule({
        target: totalRepayment,
        deps: [principal, interest],
        spec: { type: "total" },
        eval: (get) => ({ output: get(principal) + get(interest) }),
      }),
      { schema: v.pipe(v.number(), v.maxValue(10_000_000)), schemaSeverity: "warning" },
    );

    const compiled = compileModelOrThrow(m.build());

    // Step 1: Validate inputs
    const facts = { principal: 50000, rate: 0.05, years: 10 };
    const inputValidation = validateSync(validateFacts(compiled, facts));
    expect(inputValidation.valid).toBe(true);

    // Step 2: Evaluate
    const evalResult = evaluate(compiled, facts);
    expect(evalResult.values.get("interest")).toBe(25000);
    expect(evalResult.values.get("total_repayment")).toBe(75000);

    // Step 3: Validate derived values
    const outputValidation = validateSync(validateEvaluation(compiled, evalResult));
    expect(outputValidation.valid).toBe(true);
    expect(outputValidation.issues).toHaveLength(0);

    // Step 4: Validate with an overlay that changes things
    const draft = {
      draftId: "what-if-1",
      base: facts,
      overlay: { rate: 0.3 },
    };
    const overlayValidation = validateSync(validateOverlay(compiled, draft.overlay));
    expect(overlayValidation.valid).toBe(true);

    // Step 5: Evaluate draft and validate outputs
    const draftResult = evaluateDraft(compiled, draft);
    if (draftResult instanceof Promise) throw new Error("Expected sync");
    const draftOutputValidation = validateSync(validateEvaluation(compiled, draftResult.result));
    // total_repayment = 50000 + 50000*0.3*10 = 200000 — under 10M, still valid
    expect(draftOutputValidation.valid).toBe(true);
  });
});
