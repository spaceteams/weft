import { expect, it } from "vitest";
import { key } from "../key";
import { compileModel } from "../model/compile-model";
import { createModel } from "../model/create-model";
import { evaluate } from ".";

const input1 = key("input1");
const m = createModel();
m.input(input1);
const c = compileModel(m.build());
if (!c.ok) {
  expect.fail();
}
const oneInputModel = c.model;

it("evaluates inputs", () => {
  const result = evaluate(oneInputModel, { input1: "some-value" });
  expect(result.values.get(input1.id)).toBe("some-value");
});

it("fails on missing input", () => {
  expect(() => evaluate(oneInputModel, {})).toThrow("Missing input: input1");
});

it("accepts missing input if lenient", () => {
  const result = evaluate(oneInputModel, {}, "lenient");
  expect(result.values.get(input1.id)).toBeUndefined();
});
