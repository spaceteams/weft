import { describe, expect, it } from "vitest";
import type { TraceStep } from "../evaluate/trace-step";
import { key } from "../key";
import { compileModel } from "../model/compile-model";
import { createModel } from "../model/create-model";
import { canonicalize } from "./canonicalize";
import { canonicalizeFacts } from "./canonicalizeFacts";
import { canonicalizeTraceStep } from "./canonicalizeTraceStep";

function compileOrFail(model: ReturnType<ReturnType<typeof createModel>["build"]>) {
  const result = compileModel(model);
  if (!result.ok) throw new Error(result.issues.map((i) => i.message).join());
  return result.model;
}

describe("canonicalize", () => {
  it("canonicalizes primitives, arrays, objects, and dates", () => {
    expect(canonicalize({ b: 1, a: [true, null, "x"] })).toEqual({ a: [true, null, "x"], b: 1 });
    expect(canonicalize(new Date("2026-01-02T03:04:05.000Z"))).toBe("2026-01-02T03:04:05.000Z");
  });

  it("throws on unsupported values", () => {
    expect(() => canonicalize(undefined)).toThrow(/Unsupported value for canonicalization/);
    expect(() => canonicalize(() => 1)).toThrow(/Unsupported value for canonicalization/);
  });

  // Known gap (PLAN 7g): Set, Map, and RegExp are plain `typeof "object"`, so
  // they fall through to the object branch and canonicalize to `{}` rather than
  // throwing. That silently loses data and makes distinct values collide under
  // fingerprinting. Pinned here so the behaviour cannot change unnoticed.
  it("currently collapses Set, Map, and RegExp to an empty object", () => {
    expect(canonicalize(new Set([1, 2, 3]))).toEqual({});
    expect(canonicalize(new Map([["a", 1]]))).toEqual({});
    expect(canonicalize(/abc/g)).toEqual({});
  });

  it("keeps the original message when no path is supplied", () => {
    expect(() => canonicalize(undefined)).toThrow(
      "Unsupported value for canonicalization: undefined",
    );
  });

  it("names the offending nested path when one is supplied", () => {
    expect(() => canonicalize({ a: { b: undefined } }, "detail")).toThrow(
      "Unsupported value for canonicalization: undefined (at detail.a.b)",
    );
  });

  it("derives the path from the value itself when no prefix is supplied", () => {
    expect(() => canonicalize({ a: { b: undefined } })).toThrow("(at a.b)");
    expect(() => canonicalize({ rows: [1, undefined] })).toThrow("(at rows[1])");
  });

  it("uses bracket notation for array indices", () => {
    expect(() => canonicalize([1, undefined], "rows")).toThrow("(at rows[1])");
  });

  it("reports the innermost path for deeply nested failures", () => {
    expect(() => canonicalize({ a: [{ b: { c: undefined } }] }, "trace")).toThrow(
      "(at trace.a[0].b.c)",
    );
  });
});

describe("canonicalizeFacts", () => {
  const a = key<number>("a");
  const mb = createModel();
  mb.input(a);
  const model = compileOrFail(mb.build());

  it("names the key holding an unsupported value", () => {
    expect(() => canonicalizeFacts(model, { a: undefined })).toThrow(
      "Unsupported value for canonicalization: undefined (at a)",
    );
  });

  it("prefixes the key with the artifact field when supplied", () => {
    expect(() => canonicalizeFacts(model, { a: undefined }, "values")).toThrow("(at values.a)");
  });
});

describe("canonicalizeTraceStep", () => {
  const a = key<number>("a");
  const mb = createModel();
  mb.input(a);
  const model = compileOrFail(mb.build());

  function stepWith(detail: Record<string, unknown>): TraceStep {
    return {
      target: "out",
      deps: ["a"],
      ruleSpec: { op: "sum" },
      inputs: { a: 1 },
      output: 1,
      detail,
    };
  }

  it("names the trace step and detail field", () => {
    expect(() => canonicalizeTraceStep(model, stepWith({ mode: undefined }))).toThrow(
      "Unsupported value for canonicalization: undefined (at trace.out.detail.mode)",
    );
  });

  it("names the trace step and rule spec field", () => {
    const step = { ...stepWith({}), ruleSpec: { op: undefined } };
    expect(() => canonicalizeTraceStep(model, step)).toThrow("(at trace.out.ruleSpec.op)");
  });

  it("names the trace step and input key", () => {
    const step = { ...stepWith({}), inputs: { a: undefined } };
    expect(() => canonicalizeTraceStep(model, step)).toThrow("(at trace.out.inputs.a)");
  });

  it("canonicalizes a well-formed step unchanged", () => {
    const result = canonicalizeTraceStep(model, stepWith({ op: "sum", usedDefault: false }));
    expect(result.detail).toEqual({ op: "sum", usedDefault: false });
    expect(result.ruleSpec).toEqual({ op: "sum" });
  });
});
