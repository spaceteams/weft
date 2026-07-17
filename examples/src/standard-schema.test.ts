import {
  compileModelOrThrow,
  createModel,
  key,
  toKeySchema,
  toOverlaySchema,
  toStandardSchema,
} from "@spaceteams/weft";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

function buildModel() {
  const amount = key<number>("amount");
  const rate = key<number>("rate");
  const name = key<string>("name");

  const m = createModel();
  m.input(amount, { schema: v.pipe(v.number(), v.minValue(0)) });
  m.input(rate, { schema: v.pipe(v.number(), v.minValue(0), v.maxValue(1)) });
  m.input(name); // no schema

  return { compiled: compileModelOrThrow(m.build()), amount, rate, name };
}

describe("Standard Schema output", () => {
  it("toStandardSchema validates full fact bags", async () => {
    const { compiled } = buildModel();
    const schema = toStandardSchema(compiled);

    const validResult = await schema["~standard"].validate({ amount: 100, rate: 0.5, name: "x" });
    expect(validResult.issues).toBeUndefined();
    expect("value" in validResult).toBe(true);

    const invalidResult = await schema["~standard"].validate({ amount: -1, rate: 2.0, name: "x" });
    expect(invalidResult.issues).toBeDefined();
    expect(invalidResult.issues!.length).toBe(2);
  });

  it("toStandardSchema returns issues in StandardSchemaV1 format", async () => {
    const { compiled } = buildModel();
    const schema = toStandardSchema(compiled);

    const result = await schema["~standard"].validate({ amount: -5, rate: 0.5, name: "test" });
    expect(result.issues).toBeDefined();
    expect(result.issues!.length).toBe(1);

    const issue = result.issues![0];
    expect(issue.message).toBeDefined();
    expect(typeof issue.message).toBe("string");
    expect(issue.message.length).toBeGreaterThan(0);
  });

  it("toKeySchema extracts a single key's schema", async () => {
    const { compiled, amount } = buildModel();
    const schema = toKeySchema(compiled, amount);

    expect(schema).toBeDefined();

    const validResult = await schema!["~standard"].validate(100);
    expect(validResult.issues).toBeUndefined();
    expect("value" in validResult).toBe(true);

    const invalidResult = await schema!["~standard"].validate(-5);
    expect(invalidResult.issues).toBeDefined();
    expect(invalidResult.issues!.length).toBe(1);
    expect(invalidResult.issues![0].message).toContain("0");
  });

  it("toKeySchema returns undefined for keys without schema", () => {
    const { compiled, name } = buildModel();
    const schema = toKeySchema(compiled, name);

    expect(schema).toBeUndefined();
  });

  it("toOverlaySchema validates partial overlays", async () => {
    const { compiled } = buildModel();
    const schema = toOverlaySchema(compiled);

    // Only validate the key present in the overlay
    const validResult = await schema["~standard"].validate({ rate: 0.5 });
    expect(validResult.issues).toBeUndefined();

    const invalidResult = await schema["~standard"].validate({ rate: 5.0 });
    expect(invalidResult.issues).toBeDefined();
    expect(invalidResult.issues!.length).toBe(1);
  });

  it("toOverlaySchema passes empty overlays", async () => {
    const { compiled } = buildModel();
    const schema = toOverlaySchema(compiled);

    const result = await schema["~standard"].validate({});
    expect(result.issues).toBeUndefined();
    expect("value" in result).toBe(true);
  });

  it("Standard Schema vendor and version are correct", () => {
    const { compiled } = buildModel();

    const factsSchema = toStandardSchema(compiled);
    expect(factsSchema["~standard"].version).toBe(1);
    expect(factsSchema["~standard"].vendor).toBe("@spaceteams/weft");

    const overlaySchema = toOverlaySchema(compiled);
    expect(overlaySchema["~standard"].version).toBe(1);
    expect(overlaySchema["~standard"].vendor).toBe("@spaceteams/weft");

    const { amount } = buildModel();
    const keySchemaResult = toKeySchema(compiled, amount);
    expect(keySchemaResult!["~standard"].version).toBe(1);
    expect(keySchemaResult!["~standard"].vendor).toBe("@spaceteams/weft");
  });

  it("Standard Schema can be used with a generic validator function", async () => {
    const { compiled } = buildModel();
    const schema = toStandardSchema(compiled);

    // Generic function that accepts any StandardSchemaV1
    async function validateWithStandardSchema(
      standardSchema: { "~standard": { validate: (value: unknown) => unknown } },
      value: unknown,
    ) {
      const result = await standardSchema["~standard"].validate(value);
      return result;
    }

    // The weft schema works as a generic StandardSchemaV1
    const validResult = (await validateWithStandardSchema(schema, {
      amount: 100,
      rate: 0.1,
      name: "test",
    })) as { value?: unknown; issues?: unknown[] };
    expect(validResult.issues).toBeUndefined();

    const invalidResult = (await validateWithStandardSchema(schema, {
      amount: -1,
      rate: 0.1,
      name: "test",
    })) as { value?: unknown; issues?: unknown[] };
    expect(invalidResult.issues).toBeDefined();
    expect(invalidResult.issues!.length).toBe(1);
  });
});
