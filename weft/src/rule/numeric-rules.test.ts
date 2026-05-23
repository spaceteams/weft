import { describe, expect, it } from "vitest";
import { evaluate } from "../evaluate";
import { key } from "../key";
import { compileModel } from "../model/compile-model";
import { createModel } from "../model/create-model";
import { defaultNumberOps } from "../semantics/algebra";
import { value } from "../value";
import type { Rule } from ".";
import { algebraicRules } from "./algebraic-rules";
import { numericRules } from "./numeric-rules";

function buildAndEval(rules: Rule<unknown>[], facts: Record<string, unknown>) {
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

const n = numericRules;

describe("numericRules", () => {
  it("is the same as algebraicRules(defaultNumberOps)", () => {
    const manual = algebraicRules(defaultNumberOps);
    // Both should produce equivalent rules
    const a = key<number>("a");
    const b = key<number>("b");
    const target = key<number>("target");

    const r1 = n.sum(target, [a, b]);
    const r2 = manual.sum(target, [a, b]);
    expect(r1.spec).toEqual(r2.spec);
  });

  describe("sum", () => {
    it("adds N keys", () => {
      const a = key<number>("a");
      const b = key<number>("b");
      const c = key<number>("c");
      const total = key<number>("total");
      const r = buildAndEval([n.sum(total, [a, b, c])], { a: 10, b: 20, c: 30 });
      expect(r.values.get("total")).toBe(60);
    });

    it("spec has correct opsDescriptor", () => {
      const a = key<number>("a");
      const total = key<number>("total");
      const rule = n.sum(total, [a]);
      expect(rule.spec).toMatchObject({
        op: "sum",
        opsDescriptor: { family: "default/number", version: "1" },
      });
    });
  });

  describe("difference", () => {
    it("subtracts two values", () => {
      const a = key<number>("a");
      const b = key<number>("b");
      const result = key<number>("result");
      const r = buildAndEval([n.difference(result, a, b)], { a: 100, b: 40 });
      expect(r.values.get("result")).toBe(60);
    });

    it("supports value operands", () => {
      const a = key<number>("a");
      const result = key<number>("result");
      const r = buildAndEval([n.difference(result, a, value(25))], { a: 100 });
      expect(r.values.get("result")).toBe(75);
    });
  });

  describe("product", () => {
    it("multiplies N factors", () => {
      const a = key<number>("a");
      const b = key<number>("b");
      const result = key<number>("result");
      const r = buildAndEval([n.product(result, [a, b, value(2)])], { a: 3, b: 5 });
      expect(r.values.get("result")).toBe(30);
    });
  });

  describe("negate", () => {
    it("negates a value", () => {
      const a = key<number>("a");
      const result = key<number>("result");
      const r = buildAndEval([n.negate(result, a)], { a: 42 });
      expect(r.values.get("result")).toBe(-42);
    });
  });

  describe("ratio", () => {
    it("divides two values", () => {
      const a = key<number>("a");
      const b = key<number>("b");
      const result = key<number>("result");
      const r = buildAndEval([n.ratio(result, a, b)], { a: 100, b: 4 });
      expect(r.values.get("result")).toBe(25);
    });
  });

  describe("scale", () => {
    it("multiplies by a factor", () => {
      const a = key<number>("a");
      const result = key<number>("result");
      const r = buildAndEval([n.scale(result, a, value(1.5))], { a: 100 });
      expect(r.values.get("result")).toBe(150);
    });
  });

  describe("minimum / maximum", () => {
    it("finds minimum", () => {
      const a = key<number>("a");
      const b = key<number>("b");
      const result = key<number>("result");
      const r = buildAndEval([n.minimum(result, [a, b, value(5)])], { a: 10, b: 3 });
      expect(r.values.get("result")).toBe(3);
    });

    it("finds maximum", () => {
      const a = key<number>("a");
      const b = key<number>("b");
      const result = key<number>("result");
      const r = buildAndEval([n.maximum(result, [a, b, value(5)])], { a: 10, b: 3 });
      expect(r.values.get("result")).toBe(10);
    });
  });

  describe("abs", () => {
    it("returns absolute value", () => {
      const a = key<number>("a");
      const result = key<number>("result");
      const r = buildAndEval([n.abs(result, a)], { a: -7 });
      expect(r.values.get("result")).toBe(7);
    });
  });

  describe("clamp", () => {
    it("clamps between bounds", () => {
      const a = key<number>("a");
      const result = key<number>("result");
      const r = buildAndEval([n.clamp(result, a, value(0), value(100))], { a: 150 });
      expect(r.values.get("result")).toBe(100);
    });
  });

  describe("weightedSum", () => {
    it("computes weighted sum", () => {
      const a = key<number>("a");
      const b = key<number>("b");
      const result = key<number>("result");
      const r = buildAndEval(
        [
          n.weightedSum(result, [
            { key: a, weight: value(2) },
            { key: b, weight: value(3) },
          ]),
        ],
        { a: 10, b: 5 },
      );
      expect(r.values.get("result")).toBe(35);
    });
  });

  describe("futureValue", () => {
    it("computes FV", () => {
      const rate = key<number>("rate");
      const nper = key<number>("nper");
      const pmt = key<number>("pmt");
      const pv = key<number>("pv");
      const fv = key<number>("fv");
      const r = buildAndEval([n.futureValue(fv, rate, nper, pmt, pv)], {
        rate: 0.05,
        nper: 10,
        pmt: 0,
        pv: 1000,
      });
      expect(r.values.get("fv")).toBeCloseTo(1628.89, 2);
    });
  });
});
