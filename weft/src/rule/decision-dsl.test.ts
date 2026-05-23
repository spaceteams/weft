import { describe, expect, it } from "vitest";
import { evaluate } from "../evaluate";
import { key } from "../key";
import { compileModel } from "../model/compile-model";
import { createModel } from "../model/create-model";
import { value } from "../value";
import type { Rule } from ".";
import { match, rangeSwitch, switchOn, when } from "./decision-dsl";

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

describe("when() predicate builder", () => {
  const age = key<number>("age");
  const status = key<string>("status");

  // Helper: create a getter that always returns the same value (typed for Resolver)
  const always =
    <V>(v: V) =>
    <T>() =>
      v as unknown as T;

  it("eq — matches equal values", () => {
    const p = when(age).eq(30);
    expect(p.test(always(30))).toBe(true);
    expect(p.test(always(31))).toBe(false);
  });

  it("neq — matches non-equal values", () => {
    const p = when(age).neq(30);
    expect(p.test(always(31))).toBe(true);
    expect(p.test(always(30))).toBe(false);
  });

  it("in — matches membership", () => {
    const p = when(status).in(["active", "pending"]);
    expect(p.test(always("active"))).toBe(true);
    expect(p.test(always("pending"))).toBe(true);
    expect(p.test(always("closed"))).toBe(false);
  });

  it("gt — matches greater than", () => {
    const p = when(age).gt(18);
    expect(p.test(always(19))).toBe(true);
    expect(p.test(always(18))).toBe(false);
    expect(p.test(always(17))).toBe(false);
  });

  it("gte — matches greater than or equal", () => {
    const p = when(age).gte(18);
    expect(p.test(always(18))).toBe(true);
    expect(p.test(always(19))).toBe(true);
    expect(p.test(always(17))).toBe(false);
  });

  it("lt — matches less than", () => {
    const p = when(age).lt(18);
    expect(p.test(always(17))).toBe(true);
    expect(p.test(always(18))).toBe(false);
  });

  it("lte — matches less than or equal", () => {
    const p = when(age).lte(18);
    expect(p.test(always(18))).toBe(true);
    expect(p.test(always(17))).toBe(true);
    expect(p.test(always(19))).toBe(false);
  });

  it("between — matches inclusive range", () => {
    const p = when(age).between(18, 65);
    expect(p.test(always(18))).toBe(true);
    expect(p.test(always(40))).toBe(true);
    expect(p.test(always(65))).toBe(true);
    expect(p.test(always(17))).toBe(false);
    expect(p.test(always(66))).toBe(false);
  });

  it("string comparison — gt/lt work for strings", () => {
    const name = key<string>("name");
    const p = when(name).gt("b");
    expect(p.test(always("c"))).toBe(true);
    expect(p.test(always("a"))).toBe(false);
  });

  it("eq — supports comparing against another key", () => {
    const a = key<number>("a");
    const b = key<number>("b");
    const p = when(a).eq(b);
    expect(p.deps).toEqual([b]);
    const get = <T>(k: { id: string }) => (k.id === "a" ? 5 : 5) as T;
    expect(p.test(get)).toBe(true);
    const get2 = <T>(k: { id: string }) => (k.id === "a" ? 5 : 6) as T;
    expect(p.test(get2)).toBe(false);
  });

  it("tracks source and deps correctly", () => {
    const p = when(age).gte(30);
    expect(p.source).toBe(age);
    expect(p.deps).toEqual([]);
    expect(p.descriptor).toEqual({
      op: "gte",
      source: "age",
      right: { __kind: "value", value: 30 },
    });
  });
});

describe("match()", () => {
  const age = key<number>("age");
  const status = key<string>("status");
  const discount = key<number>("discount");

  it("evaluates a basic match table with mixed-type predicates", () => {
    const r1 = buildAndEval(
      [
        match(discount, {
          name: "discount-table",
          rows: [
            {
              id: "senior-active",
              when: [when(age).gte(65), when(status).eq("active")],
              output: value(0.2),
            },
            { id: "student", when: [when(age).lt(25)], output: value(0.15) },
          ],
          default: value(0),
        }),
      ],
      { age: 70, status: "active" },
    );
    expect(r1.values.get("discount")).toBe(0.2);

    // Student match
    const r2 = buildAndEval(
      [
        match(discount, {
          name: "discount-table",
          rows: [
            {
              id: "senior-active",
              when: [when(age).gte(65), when(status).eq("active")],
              output: value(0.2),
            },
            { id: "student", when: [when(age).lt(25)], output: value(0.15) },
          ],
          default: value(0),
        }),
      ],
      { age: 20, status: "inactive" },
    );
    expect(r2.values.get("discount")).toBe(0.15);

    // Default
    const r3 = buildAndEval(
      [
        match(discount, {
          name: "discount-table",
          rows: [
            {
              id: "senior-active",
              when: [when(age).gte(65), when(status).eq("active")],
              output: value(0.2),
            },
            { id: "student", when: [when(age).lt(25)], output: value(0.15) },
          ],
          default: value(0),
        }),
      ],
      { age: 40, status: "inactive" },
    );
    expect(r3.values.get("discount")).toBe(0);
  });

  it("first matching row wins", () => {
    const r = buildAndEval(
      [
        match(discount, {
          name: "first-match",
          rows: [
            { id: "low", when: [when(age).lt(30)], output: value(0.1) },
            { id: "very-low", when: [when(age).lt(20)], output: value(0.2) },
          ],
          default: value(0),
        }),
      ],
      { age: 15 },
    );
    expect(r.values.get("discount")).toBe(0.1); // first row matched
  });

  it("throws when no row matches and no default", () => {
    expect(() =>
      buildAndEval(
        [
          match(discount, {
            name: "no-default",
            rows: [{ id: "senior", when: [when(age).gte(65)], output: value(0.5) }],
          }),
        ],
        { age: 30 },
      ),
    ).toThrow('No matching row found in match table "no-default"');
  });

  it("supports output as a key reference", () => {
    const baseDiscount = key<number>("base_discount");
    const m = createModel();
    m.input(age);
    m.input(baseDiscount);
    m.rule(
      match(discount, {
        name: "key-output",
        rows: [{ id: "senior", when: [when(age).gte(65)], output: baseDiscount }],
        default: value(0),
      }),
    );
    const compiled = compileModel(m.build());
    if (!compiled.ok) throw new Error(compiled.issues.map((i) => i.message).join());
    const r = evaluate(compiled.model, { age: 70, base_discount: 0.3 });
    expect(r.values.get("discount")).toBe(0.3);
  });

  it("produces trace detail", () => {
    const r = buildAndEval(
      [
        match(discount, {
          name: "traced",
          rows: [{ id: "senior", when: [when(age).gte(65)], output: value(0.2), label: "Senior" }],
          default: value(0),
        }),
      ],
      { age: 70 },
    );
    const step = r.trace.find((t) => t.target === "discount");
    expect(step?.detail).toEqual({
      op: "match",
      tableName: "traced",
      matchedRowId: "senior",
      matchedRowLabel: "Senior",
      usedDefault: false,
    });
  });
});

describe("switchOn()", () => {
  const category = key<string>("category");
  const basePrice = key<number>("base_price");

  it("matches using record-style cases", () => {
    const theRule = switchOn(category, basePrice, {
      name: "category-pricing",
      cases: {
        standard: value(100),
        premium: value(250),
        enterprise: value(500),
      },
      default: value(50),
    });

    expect(buildAndEval([theRule], { category: "standard" }).values.get("base_price")).toBe(100);
    expect(buildAndEval([theRule], { category: "premium" }).values.get("base_price")).toBe(250);
    expect(buildAndEval([theRule], { category: "enterprise" }).values.get("base_price")).toBe(500);
    expect(buildAndEval([theRule], { category: "unknown" }).values.get("base_price")).toBe(50);
  });

  it("matches using array-style cases", () => {
    const theRule = switchOn(category, basePrice, {
      name: "array-pricing",
      cases: [
        { match: "standard", output: value(100) },
        { match: ["premium", "gold"], output: value(300) },
      ],
      default: value(50),
    });

    expect(buildAndEval([theRule], { category: "standard" }).values.get("base_price")).toBe(100);
    expect(buildAndEval([theRule], { category: "premium" }).values.get("base_price")).toBe(300);
    expect(buildAndEval([theRule], { category: "gold" }).values.get("base_price")).toBe(300);
    expect(buildAndEval([theRule], { category: "other" }).values.get("base_price")).toBe(50);
  });

  it("works with numeric source", () => {
    const tier = key<number>("tier");
    const label = key<string>("label");

    const theRule = switchOn(tier, label, {
      name: "tier-labels",
      cases: [
        { match: 1, output: value("bronze") },
        { match: 2, output: value("silver") },
        { match: 3, output: value("gold") },
      ],
      default: value("unknown"),
    });

    expect(buildAndEval([theRule], { tier: 2 }).values.get("label")).toBe("silver");
  });
});

describe("rangeSwitch()", () => {
  const income = key<number>("income");
  const taxBracket = key<string>("tax_bracket");

  it("matches ascending numeric ranges", () => {
    const theRule = rangeSwitch(income, taxBracket, {
      name: "tax-brackets",
      ranges: [
        { below: 10_000, output: value("exempt") },
        { below: 50_000, output: value("standard") },
        { below: 100_000, output: value("elevated") },
      ],
      default: value("maximum"),
    });

    expect(buildAndEval([theRule], { income: 5_000 }).values.get("tax_bracket")).toBe("exempt");
    expect(buildAndEval([theRule], { income: 9_999 }).values.get("tax_bracket")).toBe("exempt");
    expect(buildAndEval([theRule], { income: 10_000 }).values.get("tax_bracket")).toBe("standard");
    expect(buildAndEval([theRule], { income: 49_999 }).values.get("tax_bracket")).toBe("standard");
    expect(buildAndEval([theRule], { income: 50_000 }).values.get("tax_bracket")).toBe("elevated");
    expect(buildAndEval([theRule], { income: 99_999 }).values.get("tax_bracket")).toBe("elevated");
    expect(buildAndEval([theRule], { income: 100_000 }).values.get("tax_bracket")).toBe("maximum");
    expect(buildAndEval([theRule], { income: 500_000 }).values.get("tax_bracket")).toBe("maximum");
  });

  it("returns default when above all ranges", () => {
    const theRule = rangeSwitch(income, taxBracket, {
      name: "simple-range",
      ranges: [{ below: 100, output: value("low") }],
      default: value("high"),
    });

    expect(buildAndEval([theRule], { income: 50 }).values.get("tax_bracket")).toBe("low");
    expect(buildAndEval([theRule], { income: 100 }).values.get("tax_bracket")).toBe("high");
    expect(buildAndEval([theRule], { income: 200 }).values.get("tax_bracket")).toBe("high");
  });

  it("produces trace detail with row labels", () => {
    const theRule = rangeSwitch(income, taxBracket, {
      name: "traced-brackets",
      ranges: [
        { below: 50_000, output: value("low") },
        { below: 100_000, output: value("mid") },
      ],
      default: value("high"),
    });

    const r = buildAndEval([theRule], { income: 30_000 });
    const step = r.trace.find((t) => t.target === "tax_bracket");
    expect(step?.detail).toEqual({
      op: "match",
      tableName: "traced-brackets",
      matchedRowId: "range-below-50000",
      matchedRowLabel: "< 50000",
      usedDefault: false,
    });
  });
});
