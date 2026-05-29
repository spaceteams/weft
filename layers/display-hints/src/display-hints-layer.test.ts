import { compileModel, createModel, evaluate, key, rule } from "@spaceteams/weft";
import { describe, expect, it } from "vitest";
import type { DisplayHints } from ".";
import { displayHint, displayHintsLayer } from ".";

function compileOrFail(model: ReturnType<ReturnType<typeof createModel>["build"]>) {
  const result = compileModel(model);
  if (!result.ok) throw new Error(`Compile failed: ${result.issues.map((i) => i.message)}`);
  return result.model;
}

describe("display-hints layer", () => {
  it("is non-propagating — rule targets do not inherit hints from deps", () => {
    const price = key<number>("price");
    const quantity = key<number>("quantity");
    const total = key<number>("total");

    const m = createModel();
    m.input(price);
    m.input(quantity);
    m.layer(displayHintsLayer);
    m.annotate(price, "display-hints", displayHint({ unit: "EUR", semanticType: "currency" }));
    m.annotate(quantity, "display-hints", displayHint({ unit: "pcs" }));

    m.rule(
      rule({
        target: total,
        deps: [price, quantity],
        spec: { op: "product" },
        eval: (get) => ({ output: get(price) * get(quantity) }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { price: 10, quantity: 5 });

    expect(result.values.get("total")).toBe(50);

    const hints = result.layers.get("display-hints");
    expect(hints).toBeDefined();

    // Annotated inputs carry their hints
    expect(hints?.get("price")).toEqual({ unit: "EUR", semanticType: "currency" });
    expect(hints?.get("quantity")).toEqual({ unit: "pcs" });

    // Rule target does NOT inherit — non-propagating
    expect(hints?.get("total")).toBeUndefined();
  });

  it("annotated inputs carry their display hints through evaluation", () => {
    const weight = key<number>("weight");
    const height = key<number>("height");

    const m = createModel();
    m.input(weight);
    m.input(height);
    m.layer(displayHintsLayer);
    m.annotate(weight, "display-hints", displayHint({ unit: "kg" }));
    m.annotate(height, "display-hints", displayHint({ unit: "m", semanticType: "duration" }));

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { weight: 80, height: 1.8 });

    const hints = result.layers.get("display-hints");
    expect(hints?.get("weight")).toEqual({ unit: "kg" });
    expect(hints?.get("height")).toEqual({ unit: "m", semanticType: "duration" });
  });

  it("codec round-trips correctly", () => {
    const { codec } = displayHintsLayer;
    expect(codec).toBeDefined();

    const full: DisplayHints = { unit: "EUR", semanticType: "currency" };
    expect(codec!.decode(codec!.encode(full))).toEqual(full);

    const unitOnly: DisplayHints = { unit: "kg" };
    expect(codec!.decode(codec!.encode(unitOnly))).toEqual(unitOnly);

    const semanticOnly: DisplayHints = { semanticType: "percent" };
    expect(codec!.decode(codec!.encode(semanticOnly))).toEqual(semanticOnly);

    const empty: DisplayHints = {};
    expect(codec!.decode(codec!.encode(empty))).toEqual(empty);
  });

  it("integrates with the full evaluation pipeline", () => {
    const revenue = key<number>("revenue");
    const cost = key<number>("cost");
    const margin = key<number>("margin");
    const marginPct = key<number>("marginPct");

    const m = createModel();
    m.input(revenue);
    m.input(cost);
    m.layer(displayHintsLayer);
    m.annotate(revenue, "display-hints", displayHint({ unit: "EUR", semanticType: "currency" }));
    m.annotate(cost, "display-hints", displayHint({ unit: "EUR", semanticType: "currency" }));
    // Annotate a rule target directly
    m.annotate(marginPct, "display-hints", displayHint({ semanticType: "percent" }));

    m.rule(
      rule({
        target: margin,
        deps: [revenue, cost],
        spec: { op: "difference" },
        eval: (get) => ({ output: get(revenue) - get(cost) }),
      }),
    );
    m.rule(
      rule({
        target: marginPct,
        deps: [margin, revenue],
        spec: { op: "ratio" },
        eval: (get) => ({ output: get(margin) / get(revenue) }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { revenue: 1000, cost: 600 });

    expect(result.values.get("margin")).toBe(400);
    expect(result.values.get("marginPct")).toBeCloseTo(0.4);

    const hints = result.layers.get("display-hints");
    expect(hints).toBeDefined();

    // Inputs carry annotations
    expect(hints?.get("revenue")).toEqual({ unit: "EUR", semanticType: "currency" });
    expect(hints?.get("cost")).toEqual({ unit: "EUR", semanticType: "currency" });

    // margin is a rule target with no annotation — absent
    expect(hints?.get("margin")).toBeUndefined();

    // marginPct was explicitly annotated
    expect(hints?.get("marginPct")).toEqual({ semanticType: "percent" });
  });

  it("displayHint convenience helper returns the same object", () => {
    const hints = displayHint({ unit: "m/s" });
    expect(hints).toEqual({ unit: "m/s" });
  });
});
