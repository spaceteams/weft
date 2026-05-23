import { compileModel, createModel, freezeModel, hydrateModel, key } from "@spaceteams/weft";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

function compileOrFail(model: ReturnType<ReturnType<typeof createModel>["build"]>) {
  const result = compileModel(model);
  if (!result.ok) {
    throw new Error(result.issues.map((i) => i.message).join(", "));
  }
  return result.model;
}

describe("JSON Schema type inference through freeze/hydrate", () => {
  describe("explicit jsonSchema on inputs", () => {
    it("string produces { type: 'string' }", () => {
      const name = key<string>("name");
      const m = createModel();
      m.input(name, {
        schema: v.string(),
        jsonSchema: { type: "string" },
      });
      const compiled = compileOrFail(m.build());
      const frozen = freezeModel(compiled);
      expect(frozen.jsonSchemas?.name.schema.type).toBe("string");
    });

    it("string with minLength produces { type: 'string', minLength: 1 }", () => {
      const name = key<string>("name");
      const m = createModel();
      m.input(name, {
        schema: v.pipe(v.string(), v.minLength(1)),
        jsonSchema: { type: "string", minLength: 1 },
      });
      const compiled = compileOrFail(m.build());
      const frozen = freezeModel(compiled);
      expect(frozen.jsonSchemas?.name.schema.type).toBe("string");
      expect(frozen.jsonSchemas?.name.schema.minLength).toBe(1);
    });

    it("enum/picklist produces { type: 'string', enum: [...] }", () => {
      const tier = key<"gold" | "silver" | "bronze">("tier");
      const m = createModel();
      m.input(tier, {
        schema: v.picklist(["gold", "silver", "bronze"]),
        jsonSchema: { type: "string", enum: ["gold", "silver", "bronze"] },
      });
      const compiled = compileOrFail(m.build());
      const frozen = freezeModel(compiled);
      expect(frozen.jsonSchemas?.tier.schema.type).toBe("string");
      expect(frozen.jsonSchemas?.tier.schema.enum).toEqual(["gold", "silver", "bronze"]);
    });

    it("number with min/max produces { type: 'number', minimum, maximum }", () => {
      const rate = key<number>("rate");
      const m = createModel();
      m.input(rate, {
        schema: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
        jsonSchema: { type: "number", minimum: 0, maximum: 1 },
      });
      const compiled = compileOrFail(m.build());
      const frozen = freezeModel(compiled);
      expect(frozen.jsonSchemas?.rate.schema.type).toBe("number");
      expect(frozen.jsonSchemas?.rate.schema.minimum).toBe(0);
      expect(frozen.jsonSchemas?.rate.schema.maximum).toBe(1);
    });

    it("boolean produces { type: 'boolean' }", () => {
      const active = key<boolean>("active");
      const m = createModel();
      m.input(active, {
        schema: v.boolean(),
        jsonSchema: { type: "boolean" },
      });
      const compiled = compileOrFail(m.build());
      const frozen = freezeModel(compiled);
      expect(frozen.jsonSchemas?.active.schema.type).toBe("boolean");
    });

    it("integer produces { type: 'integer' }", () => {
      const count = key<number>("count");
      const m = createModel();
      m.input(count, {
        schema: v.pipe(v.number(), v.integer()),
        jsonSchema: { type: "integer" },
      });
      const compiled = compileOrFail(m.build());
      const frozen = freezeModel(compiled);
      expect(frozen.jsonSchemas?.count.schema.type).toBe("integer");
    });

    it("jsonSchema without validation schema (metadata-only)", () => {
      const category = key<string>("category");
      const m = createModel();
      m.input(category, {
        jsonSchema: { type: "string", enum: ["A", "B", "C"] },
      });
      const compiled = compileOrFail(m.build());
      const frozen = freezeModel(compiled);
      expect(frozen.jsonSchemas?.category.schema.type).toBe("string");
      expect(frozen.jsonSchemas?.category.schema.enum).toEqual(["A", "B", "C"]);
    });
  });

  describe("keyValueTypes derivation", () => {
    it("derives types from JSON Schema type field", () => {
      const name = key<string>("name");
      const amount = key<number>("amount");
      const active = key<boolean>("active");
      const count = key<number>("count");
      const tier = key<"gold" | "silver" | "bronze">("tier");

      const m = createModel();
      m.input(name, { jsonSchema: { type: "string" } });
      m.input(amount, { jsonSchema: { type: "number" } });
      m.input(active, { jsonSchema: { type: "boolean" } });
      m.input(count, { jsonSchema: { type: "integer" } });
      m.input(tier, { jsonSchema: { type: "string", enum: ["gold", "silver", "bronze"] } });

      const compiled = compileOrFail(m.build());
      const frozen = freezeModel(compiled);

      expect(frozen.keyValueTypes).toBeDefined();
      expect(frozen.keyValueTypes?.name).toBe("string");
      expect(frozen.keyValueTypes?.amount).toBe("number");
      expect(frozen.keyValueTypes?.active).toBe("boolean");
      expect(frozen.keyValueTypes?.count).toBe("integer");
      expect(frozen.keyValueTypes?.tier).toBe("string");
    });

    it("marks keys without schemas as 'unknown'", () => {
      const name = key<string>("name");
      const untyped = key<number>("untyped");

      const m = createModel();
      m.input(name, { jsonSchema: { type: "string" } });
      m.input(untyped);

      const compiled = compileOrFail(m.build());
      const frozen = freezeModel(compiled);

      expect(frozen.keyValueTypes?.name).toBe("string");
      expect(frozen.keyValueTypes?.untyped).toBe("unknown");
    });

    it("survives freeze → JSON → hydrate round-trip", () => {
      const name = key<string>("name");
      const amount = key<number>("amount");
      const active = key<boolean>("active");

      const m = createModel();
      m.input(name, { jsonSchema: { type: "string" } });
      m.input(amount, { jsonSchema: { type: "number" } });
      m.input(active, { jsonSchema: { type: "boolean" } });

      const compiled = compileOrFail(m.build());
      const frozen = JSON.parse(JSON.stringify(freezeModel(compiled)));
      const hydrated = hydrateModel(frozen);

      expect(hydrated.keyValueTypes).toBeInstanceOf(Map);
      expect(hydrated.keyValueTypes?.get("name")).toBe("string");
      expect(hydrated.keyValueTypes?.get("amount")).toBe("number");
      expect(hydrated.keyValueTypes?.get("active")).toBe("boolean");
    });
  });

  describe("semanticType in keyMeta", () => {
    it("is preserved through freeze/hydrate", () => {
      const rate = key<number>("rate");

      const m = createModel();
      m.input(rate, {
        meta: { label: "Interest Rate", semanticType: "percent" },
        schema: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
        jsonSchema: { type: "number", minimum: 0, maximum: 1 },
      });

      const compiled = compileOrFail(m.build());
      const frozen = JSON.parse(JSON.stringify(freezeModel(compiled)));
      const hydrated = hydrateModel(frozen);

      expect(hydrated.keyMeta.get("rate")?.semanticType).toBe("percent");
    });

    it("supports all semantic type values", () => {
      const pct = key<number>("pct");
      const price = key<number>("price");
      const dob = key<string>("dob");

      const m = createModel();
      m.input(pct, { meta: { semanticType: "percent" } });
      m.input(price, { meta: { semanticType: "currency" } });
      m.input(dob, { meta: { semanticType: "date" } });

      const compiled = compileOrFail(m.build());
      const frozen = JSON.parse(JSON.stringify(freezeModel(compiled)));
      const hydrated = hydrateModel(frozen);

      expect(hydrated.keyMeta.get("pct")?.semanticType).toBe("percent");
      expect(hydrated.keyMeta.get("price")?.semanticType).toBe("currency");
      expect(hydrated.keyMeta.get("dob")?.semanticType).toBe("date");
    });
  });

  describe("~standard.jsonSchema auto-extraction", () => {
    it("Valibot 1.4.0 does not expose ~standard.jsonSchema (known limitation)", () => {
      // Valibot 1.4.0 only exposes { version, vendor, validate } on ~standard.
      // JSON Schema auto-extraction requires libraries that implement the
      // StandardJSONSchemaV1 extension (e.g. Zod 3.24+, future Valibot versions).
      // Use the explicit `jsonSchema` option as a workaround.
      const s = v.string();
      const standard = (s as unknown as Record<string, unknown>)["~standard"] as Record<
        string,
        unknown
      >;
      expect("jsonSchema" in standard).toBe(false);
    });
  });
});
