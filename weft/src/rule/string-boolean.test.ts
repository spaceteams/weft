import { describe, expect, it } from "vitest";
import { evaluate } from "../evaluate";
import { key } from "../key";
import { compileModel } from "../model/compile-model";
import { createModel } from "../model/create-model";
import { value } from "../value";
import { coerce } from "./coerce";
import { compare } from "./compare";
import { concat } from "./concat";
import { format } from "./format";
import { logicalAnd, logicalNot, logicalOr } from "./logical";
import { template } from "./template";

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

describe("concat", () => {
  const firstName = key<string>("firstName");
  const lastName = key<string>("lastName");
  const fullName = key<string>("fullName");

  it("concatenates with separator", () => {
    const r = buildAndEval([concat(fullName, [firstName, lastName], " ")], {
      firstName: "Alice",
      lastName: "Smith",
    });
    expect(r.values.get("fullName")).toBe("Alice Smith");
  });

  it("concatenates without separator (default empty)", () => {
    const r = buildAndEval([concat(fullName, [firstName, lastName])], {
      firstName: "Hello",
      lastName: "World",
    });
    expect(r.values.get("fullName")).toBe("HelloWorld");
  });

  it("handles single part", () => {
    const r = buildAndEval([concat(fullName, [firstName])], { firstName: "Solo" });
    expect(r.values.get("fullName")).toBe("Solo");
  });

  it("spec contains correct metadata", () => {
    const r = concat(fullName, [firstName, lastName], ", ");
    expect(r.spec).toEqual({
      op: "concat",
      parts: ["firstName", "lastName"],
      separator: ", ",
    });
  });
});

describe("template", () => {
  const greeting = key<string>("greeting");
  const name = key<string>("name");
  const count = key<number>("count");

  it("interpolates placeholders", () => {
    const r = buildAndEval([template(greeting, "{name} has {count} items", { name, count })], {
      name: "Alice",
      count: 5,
    });
    expect(r.values.get("greeting")).toBe("Alice has 5 items");
  });

  it("handles multiple occurrences of same placeholder", () => {
    const r = buildAndEval([template(greeting, "{name} and {name}", { name, count })], {
      name: "Bob",
      count: 0,
    });
    expect(r.values.get("greeting")).toBe("Bob and Bob");
  });

  it("leaves unmatched braces alone", () => {
    const r = buildAndEval([template(greeting, "{name} {unknown}", { name, count })], {
      name: "Alice",
      count: 1,
    });
    expect(r.values.get("greeting")).toBe("Alice {unknown}");
  });

  it("spec contains pattern and dep mapping", () => {
    const r = template(greeting, "{name} has {count} items", { name, count });
    expect(r.spec).toEqual({
      op: "template",
      pattern: "{name} has {count} items",
      deps: { name: "name", count: "count" },
    });
  });
});

describe("format", () => {
  const amount = key<number>("amount");
  const display = key<string>("display");

  it("formats a number value", () => {
    const r = buildAndEval([format(display, amount, (v) => `€${v.toFixed(2)}`)], {
      amount: 42.5,
    });
    expect(r.values.get("display")).toBe("€42.50");
  });

  it("formats a string value", () => {
    const source = key<string>("source");
    const upper = key<string>("upper");
    const r = buildAndEval([format(upper, source, (v) => v.toUpperCase())], { source: "hello" });
    expect(r.values.get("upper")).toBe("HELLO");
  });

  it("spec contains source key id", () => {
    const r = format(display, amount, (v) => String(v));
    expect(r.spec).toEqual({
      op: "format",
      source: "amount",
    });
  });
});

describe("logicalAnd", () => {
  const a = key<boolean>("a");
  const b = key<boolean>("b");
  const c = key<boolean>("c");
  const result = key<boolean>("result");

  it("all true → true", () => {
    const r = buildAndEval([logicalAnd(result, [a, b, c])], { a: true, b: true, c: true });
    expect(r.values.get("result")).toBe(true);
  });

  it("one false → false", () => {
    const r = buildAndEval([logicalAnd(result, [a, b, c])], { a: true, b: false, c: true });
    expect(r.values.get("result")).toBe(false);
  });

  it("spec contains dep ids", () => {
    const r = logicalAnd(result, [a, b]);
    expect(r.spec).toEqual({ op: "and", deps: ["a", "b"] });
  });
});

describe("logicalOr", () => {
  const a = key<boolean>("a");
  const b = key<boolean>("b");
  const c = key<boolean>("c");
  const result = key<boolean>("result");

  it("all false → false", () => {
    const r = buildAndEval([logicalOr(result, [a, b, c])], { a: false, b: false, c: false });
    expect(r.values.get("result")).toBe(false);
  });

  it("one true → true", () => {
    const r = buildAndEval([logicalOr(result, [a, b, c])], { a: false, b: true, c: false });
    expect(r.values.get("result")).toBe(true);
  });

  it("spec contains dep ids", () => {
    const r = logicalOr(result, [a, b]);
    expect(r.spec).toEqual({ op: "or", deps: ["a", "b"] });
  });
});

describe("logicalNot", () => {
  const source = key<boolean>("source");
  const result = key<boolean>("result");

  it("true → false", () => {
    const r = buildAndEval([logicalNot(result, source)], { source: true });
    expect(r.values.get("result")).toBe(false);
  });

  it("false → true", () => {
    const r = buildAndEval([logicalNot(result, source)], { source: false });
    expect(r.values.get("result")).toBe(true);
  });

  it("spec contains source id", () => {
    const r = logicalNot(result, source);
    expect(r.spec).toEqual({ op: "not", source: "source" });
  });
});

describe("compare", () => {
  const age = key<number>("age");
  const isAdult = key<boolean>("isAdult");

  it("gte with value operand (true)", () => {
    const r = buildAndEval([compare(isAdult, age, value(18), "gte")], { age: 21 });
    expect(r.values.get("isAdult")).toBe(true);
  });

  it("gte with value operand (false)", () => {
    const r = buildAndEval([compare(isAdult, age, value(18), "gte")], { age: 15 });
    expect(r.values.get("isAdult")).toBe(false);
  });

  it("eq comparison", () => {
    const r = buildAndEval([compare(isAdult, age, value(18), "eq")], { age: 18 });
    expect(r.values.get("isAdult")).toBe(true);
  });

  it("neq comparison", () => {
    const r = buildAndEval([compare(isAdult, age, value(18), "neq")], { age: 18 });
    expect(r.values.get("isAdult")).toBe(false);
  });

  it("gt comparison", () => {
    const r = buildAndEval([compare(isAdult, age, value(18), "gt")], { age: 18 });
    expect(r.values.get("isAdult")).toBe(false);
  });

  it("lt comparison", () => {
    const r = buildAndEval([compare(isAdult, age, value(18), "lt")], { age: 17 });
    expect(r.values.get("isAdult")).toBe(true);
  });

  it("lte comparison", () => {
    const r = buildAndEval([compare(isAdult, age, value(18), "lte")], { age: 18 });
    expect(r.values.get("isAdult")).toBe(true);
  });

  it("compare with key operand", () => {
    const threshold = key<number>("threshold");
    const r = buildAndEval([compare(isAdult, age, threshold, "gte")], {
      age: 21,
      threshold: 18,
    });
    expect(r.values.get("isAdult")).toBe(true);
  });

  it("spec contains metadata", () => {
    const r = compare(isAdult, age, value(18), "gte");
    expect(r.spec).toEqual({
      op: "compare",
      left: "age",
      right: 18,
      compareOp: "gte",
    });
  });
});

describe("coerce", () => {
  const rawInput = key<string>("rawInput");
  const parsed = key<number>("parsed");

  it("converts string to number", () => {
    const r = buildAndEval([coerce(parsed, rawInput, (s) => Number.parseFloat(s))], {
      rawInput: "3.14",
    });
    expect(r.values.get("parsed")).toBeCloseTo(3.14);
  });

  it("converts number to string", () => {
    const num = key<number>("num");
    const str = key<string>("str");
    const r = buildAndEval([coerce(str, num, (n) => String(n))], { num: 42 });
    expect(r.values.get("str")).toBe("42");
  });

  it("converts boolean to number", () => {
    const flag = key<boolean>("flag");
    const num = key<number>("num");
    const r = buildAndEval([coerce(num, flag, (b) => (b ? 1 : 0))], { flag: true });
    expect(r.values.get("num")).toBe(1);
  });

  it("spec contains source id", () => {
    const r = coerce(parsed, rawInput, (s) => Number.parseFloat(s));
    expect(r.spec).toEqual({
      op: "coerce",
      source: "rawInput",
    });
  });
});
