import { describe, expect, it } from "vitest";
import { evaluate } from "../evaluate";
import { key } from "../key";
import { compileModel } from "../model/compile-model";
import { createModel } from "../model/create-model";
import { defaultNumberOps } from "../semantics/algebra";
import { annuityPayment, futureValue, presentValue } from "./financial";

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

describe("futureValue", () => {
  const rate = key<number>("rate");
  const nper = key<number>("nper");
  const pmt = key<number>("pmt");
  const pv = key<number>("pv");
  const result = key<number>("result");

  it("basic compound growth (no payments)", () => {
    // FV = 1000 * (1.05)^10 = 1628.89 (approx)
    const r = buildAndEval([futureValue(defaultNumberOps, result, rate, nper, pmt, pv)], {
      rate: 0.05,
      nper: 10,
      pmt: 0,
      pv: 1000,
    });
    expect(r.values.get("result")).toBeCloseTo(1628.89, 2);
  });

  it("r=0 special case", () => {
    // FV = PV + PMT * n = 1000 + 100 * 12 = 2200
    const r = buildAndEval([futureValue(defaultNumberOps, result, rate, nper, pmt, pv)], {
      rate: 0,
      nper: 12,
      pmt: 100,
      pv: 1000,
    });
    expect(r.values.get("result")).toBe(2200);
  });

  it("with regular payments", () => {
    // FV = 0 * (1.01)^12 + 100 * ((1.01)^12 - 1) / 0.01
    const r = buildAndEval([futureValue(defaultNumberOps, result, rate, nper, pmt, pv)], {
      rate: 0.01,
      nper: 12,
      pmt: 100,
      pv: 0,
    });
    expect(r.values.get("result")).toBeCloseTo(1268.25, 2);
  });
});

describe("presentValue", () => {
  const rate = key<number>("rate");
  const nper = key<number>("nper");
  const pmt = key<number>("pmt");
  const fv = key<number>("fv");
  const result = key<number>("result");

  it("basic discounting (no payments)", () => {
    // PV = 1628.89 / (1.05)^10 ≈ 1000
    const r = buildAndEval([presentValue(defaultNumberOps, result, rate, nper, pmt, fv)], {
      rate: 0.05,
      nper: 10,
      pmt: 0,
      fv: 1628.89,
    });
    expect(r.values.get("result")).toBeCloseTo(1000, 1);
  });

  it("r=0 special case", () => {
    // PV = FV - PMT * n = 2200 - 100 * 12 = 1000
    const r = buildAndEval([presentValue(defaultNumberOps, result, rate, nper, pmt, fv)], {
      rate: 0,
      nper: 12,
      pmt: 100,
      fv: 2200,
    });
    expect(r.values.get("result")).toBe(1000);
  });

  it("inverse of futureValue", () => {
    // PV of 1000 at 5% for 10 years should give ~613.91
    const r = buildAndEval([presentValue(defaultNumberOps, result, rate, nper, pmt, fv)], {
      rate: 0.05,
      nper: 10,
      pmt: 0,
      fv: 1000,
    });
    expect(r.values.get("result")).toBeCloseTo(613.91, 2);
  });
});

describe("annuityPayment", () => {
  const rate = key<number>("rate");
  const nper = key<number>("nper");
  const pv = key<number>("pv");
  const result = key<number>("result");

  it("basic annuity", () => {
    // PMT = 10000 * 0.05 * (1.05)^10 / ((1.05)^10 - 1) ≈ 1295.05
    const r = buildAndEval([annuityPayment(defaultNumberOps, result, rate, nper, pv)], {
      rate: 0.05,
      nper: 10,
      pv: 10000,
    });
    expect(r.values.get("result")).toBeCloseTo(1295.05, 2);
  });

  it("r=0 special case", () => {
    // PMT = PV / n = 12000 / 12 = 1000
    const r = buildAndEval([annuityPayment(defaultNumberOps, result, rate, nper, pv)], {
      rate: 0,
      nper: 12,
      pv: 12000,
    });
    expect(r.values.get("result")).toBe(1000);
  });

  it("known mortgage scenario", () => {
    // 200000 at 0.5% monthly for 360 months ≈ 1199.10
    const r = buildAndEval([annuityPayment(defaultNumberOps, result, rate, nper, pv)], {
      rate: 0.005,
      nper: 360,
      pv: 200000,
    });
    expect(r.values.get("result")).toBeCloseTo(1199.1, 2);
  });
});
