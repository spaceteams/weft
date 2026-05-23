import { describe, expect, it } from "vitest";
import { evaluate } from "../evaluate";
import { key } from "../key";
import { compileModel } from "../model/compile-model";
import { createModel } from "../model/create-model";
import { compose } from "./compose";
import { mapEntries } from "./map-entries";
import { pick } from "./pick";
import { pluck } from "./pluck";
import { spread } from "./spread";

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

describe("pick", () => {
  const customer = key<{ name: string; age: number; email: string }>("customer");
  const profile = key<{ name: string; email: string }>("profile");

  it("extracts specified fields", () => {
    const r = buildAndEval([pick(profile, customer, ["name", "email"])], {
      customer: { name: "Alice", age: 30, email: "alice@example.com" },
    });
    expect(r.values.get("profile")).toEqual({ name: "Alice", email: "alice@example.com" });
  });

  it("single field extraction", () => {
    const nameOnly = key<{ name: string }>("nameOnly");
    const r = buildAndEval([pick(nameOnly, customer, ["name"])], {
      customer: { name: "Bob", age: 25, email: "bob@example.com" },
    });
    expect(r.values.get("nameOnly")).toEqual({ name: "Bob" });
  });

  it("spec contains correct metadata", () => {
    const r = pick(profile, customer, ["name", "email"]);
    expect(r.spec).toEqual({
      op: "pick",
      source: "customer",
      fields: ["name", "email"],
    });
  });
});

describe("pluck", () => {
  const config = key<{ pricing: { baseRate: number; markup: number } }>("config");
  const baseRate = key<number>("baseRate");

  it("extracts nested value with dot-path string", () => {
    const r = buildAndEval([pluck(baseRate, config, "pricing.baseRate")], {
      config: { pricing: { baseRate: 0.05, markup: 0.1 } },
    });
    expect(r.values.get("baseRate")).toBe(0.05);
  });

  it("extracts nested value with array path", () => {
    const r = buildAndEval([pluck(baseRate, config, ["pricing", "baseRate"])], {
      config: { pricing: { baseRate: 0.08, markup: 0.2 } },
    });
    expect(r.values.get("baseRate")).toBe(0.08);
  });

  it("extracts shallow value", () => {
    const obj = key<{ x: number }>("obj");
    const x = key<number>("x");
    const r = buildAndEval([pluck(x, obj, "x")], { obj: { x: 42 } });
    expect(r.values.get("x")).toBe(42);
  });

  it("spec stores path as array", () => {
    const r = pluck(baseRate, config, "pricing.baseRate");
    expect(r.spec).toEqual({
      op: "pluck",
      source: "config",
      path: ["pricing", "baseRate"],
    });
  });
});

describe("compose", () => {
  const name = key<string>("name");
  const age = key<number>("age");
  const email = key<string>("email");
  const profile = key<{ name: string; age: number; email: string }>("profile");

  it("constructs object from individual keys", () => {
    const r = buildAndEval([compose(profile, { name, age, email })], {
      name: "Alice",
      age: 30,
      email: "alice@example.com",
    });
    expect(r.values.get("profile")).toEqual({
      name: "Alice",
      age: 30,
      email: "alice@example.com",
    });
  });

  it("spec contains field→keyId mapping", () => {
    const r = compose(profile, { name, age, email });
    expect(r.spec).toEqual({
      op: "compose",
      fields: { name: "name", age: "age", email: "email" },
    });
  });

  it("dependencies include all field keys", () => {
    const r = compose(profile, { name, age, email });
    expect(r.deps).toEqual(expect.arrayContaining([name, age, email]));
    expect(r.deps).toHaveLength(3);
  });
});

describe("spread", () => {
  const base = key<{ a: number }>("base");
  const extra = key<{ b: string }>("extra");
  const merged = key<{ a: number; b: string }>("merged");

  it("merges multiple objects", () => {
    const r = buildAndEval([spread(merged, [base, extra])], {
      base: { a: 1 },
      extra: { b: "hello" },
    });
    expect(r.values.get("merged")).toEqual({ a: 1, b: "hello" });
  });

  it("later sources override earlier ones", () => {
    const s1 = key<{ x: number }>("s1");
    const s2 = key<{ x: number }>("s2");
    const result = key<{ x: number }>("result");
    const r = buildAndEval([spread(result, [s1, s2])], {
      s1: { x: 1 },
      s2: { x: 2 },
    });
    expect(r.values.get("result")).toEqual({ x: 2 });
  });

  it("spec contains source key ids", () => {
    const r = spread(merged, [base, extra]);
    expect(r.spec).toEqual({
      op: "spread",
      sources: ["base", "extra"],
    });
  });
});

describe("mapEntries", () => {
  const prices = key<Record<string, number>>("prices");
  const discountedPrices = key<Record<string, number>>("discountedPrices");
  const factor = key<number>("factor");

  it("transforms all values in a record", () => {
    const r = buildAndEval([mapEntries(discountedPrices, prices, (v) => v * 0.9)], {
      prices: { widget: 100, gadget: 200 },
    });
    expect(r.values.get("discountedPrices")).toEqual({ widget: 90, gadget: 180 });
  });

  it("transform can use get to resolve extra deps", () => {
    const r = buildAndEval(
      [mapEntries(discountedPrices, prices, (v, get) => v * get(factor), [factor])],
      { prices: { widget: 100, gadget: 200 }, factor: 0.8 },
    );
    expect(r.values.get("discountedPrices")).toEqual({ widget: 80, gadget: 160 });
  });

  it("empty record produces empty record", () => {
    const r = buildAndEval([mapEntries(discountedPrices, prices, (v) => v * 2)], { prices: {} });
    expect(r.values.get("discountedPrices")).toEqual({});
  });

  it("spec contains source and extraDeps", () => {
    const r = mapEntries(discountedPrices, prices, (v) => v * 2, [factor]);
    expect(r.spec).toEqual({
      op: "mapEntries",
      source: "prices",
      extraDeps: ["factor"],
    });
  });
});
