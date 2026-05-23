import { describe, expect, it } from "vitest";
import { evaluate } from "../evaluate";
import { key } from "../key";
import { compileModel } from "../model/compile-model";
import { createModel } from "../model/create-model";
import { defaultNumberOps } from "../semantics/algebra";
import { value } from "../value";
import { abs } from "./abs";
import { clamp } from "./clamp";
import { conditional } from "./conditional";
import { round } from "./round";

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

describe("clamp", () => {
  const val = key<number>("val");
  const lo = key<number>("lo");
  const hi = key<number>("hi");
  const result = key<number>("result");

  it("value within bounds (no-op)", () => {
    const r = buildAndEval([clamp(defaultNumberOps, result, val, value(0), value(10))], { val: 5 });
    expect(r.values.get("result")).toBe(5);
  });

  it("below min", () => {
    const r = buildAndEval([clamp(defaultNumberOps, result, val, value(0), value(10))], {
      val: -3,
    });
    expect(r.values.get("result")).toBe(0);
  });

  it("above max", () => {
    const r = buildAndEval([clamp(defaultNumberOps, result, val, value(0), value(10))], {
      val: 15,
    });
    expect(r.values.get("result")).toBe(10);
  });

  it("bounds from keys", () => {
    const r = buildAndEval([clamp(defaultNumberOps, result, val, lo, hi)], {
      val: 20,
      lo: 1,
      hi: 10,
    });
    expect(r.values.get("result")).toBe(10);
  });
});

describe("abs", () => {
  const source = key<number>("source");
  const result = key<number>("result");

  it("positive (no-op)", () => {
    const r = buildAndEval([abs(defaultNumberOps, result, source)], { source: 7 });
    expect(r.values.get("result")).toBe(7);
  });

  it("negative", () => {
    const r = buildAndEval([abs(defaultNumberOps, result, source)], { source: -4 });
    expect(r.values.get("result")).toBe(4);
  });

  it("zero", () => {
    const r = buildAndEval([abs(defaultNumberOps, result, source)], { source: 0 });
    expect(r.values.get("result")).toBe(0);
  });
});

describe("round", () => {
  const source = key<number>("source");
  const result = key<number>("result");

  it("round to integer", () => {
    const r = buildAndEval([round(result, source)], { source: 3.6 });
    expect(r.values.get("result")).toBe(4);
  });

  it("floor to integer", () => {
    const r = buildAndEval([round(result, source, { mode: "floor" })], { source: 3.9 });
    expect(r.values.get("result")).toBe(3);
  });

  it("ceil to integer", () => {
    const r = buildAndEval([round(result, source, { mode: "ceil" })], { source: 3.1 });
    expect(r.values.get("result")).toBe(4);
  });

  it("trunc to integer", () => {
    const r = buildAndEval([round(result, source, { mode: "trunc" })], { source: -3.7 });
    expect(r.values.get("result")).toBe(-3);
  });

  it("round to 2 decimals", () => {
    const r = buildAndEval([round(result, source, { decimals: 2 })], { source: 3.456 });
    expect(r.values.get("result")).toBe(3.46);
  });

  it("floor to 2 decimals", () => {
    const r = buildAndEval([round(result, source, { mode: "floor", decimals: 2 })], {
      source: 3.999,
    });
    expect(r.values.get("result")).toBe(3.99);
  });

  it("negative number rounding", () => {
    const r = buildAndEval([round(result, source)], { source: -2.5 });
    expect(r.values.get("result")).toBe(-2);
  });
});

describe("conditional", () => {
  const cond = key<boolean>("cond");
  const thenVal = key<number>("thenVal");
  const elseVal = key<number>("elseVal");
  const result = key<number>("result");

  it("true branch with value operands", () => {
    const r = buildAndEval([conditional(result, cond, value(42), value(0))], { cond: true });
    expect(r.values.get("result")).toBe(42);
  });

  it("false branch with value operands", () => {
    const r = buildAndEval([conditional(result, cond, value(42), value(0))], { cond: false });
    expect(r.values.get("result")).toBe(0);
  });

  it("true branch with key operands", () => {
    const r = buildAndEval([conditional(result, cond, thenVal, elseVal)], {
      cond: true,
      thenVal: 100,
      elseVal: 200,
    });
    expect(r.values.get("result")).toBe(100);
  });

  it("false branch with key operands", () => {
    const r = buildAndEval([conditional(result, cond, thenVal, elseVal)], {
      cond: false,
      thenVal: 100,
      elseVal: 200,
    });
    expect(r.values.get("result")).toBe(200);
  });
});
