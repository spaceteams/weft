import { describe, expect, it } from "vitest";
import { evaluate } from "../evaluate";
import { key } from "../key";
import { compileModel } from "../model/compile-model";
import { createModel } from "../model/create-model";
import { defaultNumberOps } from "../semantics/algebra";
import { difference } from "./difference";
import { maximum, minimum } from "./min-max";
import { negate } from "./negate";
import { product } from "./product";

function buildAndEval(
  rules: Parameters<ReturnType<typeof createModel>["rule"]>[0][],
  facts: Record<string, unknown>,
) {
  const m = createModel();
  const inputKeys = new Set<string>();
  for (const r of rules) {
    for (const dep of r.deps) {
      if (!rules.some((rule) => rule.target.id === dep.id)) {
        if (!inputKeys.has(dep.id)) {
          m.input(dep);
          inputKeys.add(dep.id);
        }
      }
    }
    m.rule(r);
  }
  const compiled = compileModel(m.build());
  if (!compiled.ok) throw new Error(compiled.issues.map((i) => i.message).join());
  return evaluate(compiled.model, facts);
}

describe("difference", () => {
  const a = key<number>("a");
  const b = key<number>("b");
  const result = key<number>("result");

  it("basic subtraction", () => {
    const r = buildAndEval([difference(defaultNumberOps, result, a, b)], { a: 10, b: 3 });
    expect(r.values.get("result")).toBe(7);
  });

  it("zero result", () => {
    const r = buildAndEval([difference(defaultNumberOps, result, a, b)], { a: 5, b: 5 });
    expect(r.values.get("result")).toBe(0);
  });

  it("negative result", () => {
    const r = buildAndEval([difference(defaultNumberOps, result, a, b)], { a: 3, b: 10 });
    expect(r.values.get("result")).toBe(-7);
  });
});

describe("product", () => {
  const a = key<number>("a");
  const b = key<number>("b");
  const c = key<number>("c");
  const result = key<number>("result");

  it("two factors", () => {
    const r = buildAndEval([product(defaultNumberOps, result, [a, b])], { a: 4, b: 5 });
    expect(r.values.get("result")).toBe(20);
  });

  it("three factors", () => {
    const r = buildAndEval([product(defaultNumberOps, result, [a, b, c])], { a: 2, b: 3, c: 4 });
    expect(r.values.get("result")).toBe(24);
  });

  it("one factor (identity)", () => {
    const r = buildAndEval([product(defaultNumberOps, result, [a])], { a: 7 });
    expect(r.values.get("result")).toBe(7);
  });

  it("includes zero", () => {
    const r = buildAndEval([product(defaultNumberOps, result, [a, b])], { a: 5, b: 0 });
    expect(r.values.get("result")).toBe(0);
  });
});

describe("negate", () => {
  const source = key<number>("source");
  const result = key<number>("result");

  it("positive to negative", () => {
    const r = buildAndEval([negate(defaultNumberOps, result, source)], { source: 5 });
    expect(r.values.get("result")).toBe(-5);
  });

  it("negative to positive", () => {
    const r = buildAndEval([negate(defaultNumberOps, result, source)], { source: -3 });
    expect(r.values.get("result")).toBe(3);
  });

  it("zero stays zero", () => {
    const r = buildAndEval([negate(defaultNumberOps, result, source)], { source: 0 });
    expect(r.values.get("result")).toBe(0);
  });
});

describe("minimum", () => {
  const a = key<number>("a");
  const b = key<number>("b");
  const c = key<number>("c");
  const result = key<number>("result");

  it("two keys", () => {
    const r = buildAndEval([minimum(defaultNumberOps, result, [a, b])], { a: 3, b: 7 });
    expect(r.values.get("result")).toBe(3);
  });

  it("three keys", () => {
    const r = buildAndEval([minimum(defaultNumberOps, result, [a, b, c])], { a: 5, b: 2, c: 8 });
    expect(r.values.get("result")).toBe(2);
  });

  it("all equal", () => {
    const r = buildAndEval([minimum(defaultNumberOps, result, [a, b])], { a: 4, b: 4 });
    expect(r.values.get("result")).toBe(4);
  });

  it("single key", () => {
    const r = buildAndEval([minimum(defaultNumberOps, result, [a])], { a: 9 });
    expect(r.values.get("result")).toBe(9);
  });

  it("throws on empty deps", () => {
    expect(() => minimum(defaultNumberOps, result, [])).toThrow(
      "minimum requires at least one dependency",
    );
  });
});

describe("maximum", () => {
  const a = key<number>("a");
  const b = key<number>("b");
  const c = key<number>("c");
  const result = key<number>("result");

  it("two keys", () => {
    const r = buildAndEval([maximum(defaultNumberOps, result, [a, b])], { a: 3, b: 7 });
    expect(r.values.get("result")).toBe(7);
  });

  it("three keys", () => {
    const r = buildAndEval([maximum(defaultNumberOps, result, [a, b, c])], { a: 5, b: 2, c: 8 });
    expect(r.values.get("result")).toBe(8);
  });

  it("all equal", () => {
    const r = buildAndEval([maximum(defaultNumberOps, result, [a, b])], { a: 4, b: 4 });
    expect(r.values.get("result")).toBe(4);
  });

  it("single key", () => {
    const r = buildAndEval([maximum(defaultNumberOps, result, [a])], { a: 9 });
    expect(r.values.get("result")).toBe(9);
  });

  it("throws on empty deps", () => {
    expect(() => maximum(defaultNumberOps, result, [])).toThrow(
      "maximum requires at least one dependency",
    );
  });
});
