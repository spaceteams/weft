import { compileModel, createModel, evaluate, key, rule } from "@spaceteams/weft";
import { describe, expect, it } from "vitest";
import { dimensionalLayer } from "./dimensional-layer";
import type { Unit } from "./unit";
import {
  compoundUnit,
  dimensionless,
  divideUnits,
  formatUnit,
  multiplyUnits,
  unit,
  unitsEqual,
} from "./unit";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function compileOrFail(model: ReturnType<ReturnType<typeof createModel>["build"]>) {
  const result = compileModel(model);
  if (!result.ok) throw new Error(`Compile failed: ${result.issues.map((i) => i.message)}`);
  return result.model;
}

// ---------------------------------------------------------------------------
// Unit type tests
// ---------------------------------------------------------------------------

describe("Unit creation and formatting", () => {
  it("creates a base unit", () => {
    const m = unit("m");
    expect(m).toEqual({ num: ["m"], denom: [] });
    expect(formatUnit(m)).toBe("m");
  });

  it("creates a dimensionless unit", () => {
    const d = dimensionless();
    expect(d).toEqual({ num: [], denom: [] });
    expect(formatUnit(d)).toBe("1");
  });

  it("creates a compound unit", () => {
    const mps = compoundUnit(["m"], ["s"]);
    expect(mps).toEqual({ num: ["m"], denom: ["s"] });
    expect(formatUnit(mps)).toBe("m/s");
  });

  it("formats a unit with repeated base units using superscripts", () => {
    const mps2 = compoundUnit(["m"], ["s", "s"]);
    expect(formatUnit(mps2)).toBe("m/s²");

    const m2 = compoundUnit(["m", "m"], []);
    expect(formatUnit(m2)).toBe("m²");
  });

  it("formats a compound unit with multiple numerator parts", () => {
    // kg·m/s²
    const newton = compoundUnit(["kg", "m"], ["s", "s"]);
    expect(formatUnit(newton)).toBe("kg·m/s²");
  });

  it("formats a pure denominator unit", () => {
    const hz = compoundUnit([], ["s"]);
    expect(formatUnit(hz)).toBe("1/s");
  });
});

// ---------------------------------------------------------------------------
// Unit arithmetic tests
// ---------------------------------------------------------------------------

describe("Unit arithmetic", () => {
  it("multiplies two units", () => {
    const m = unit("m");
    const s = unit("s");
    const ms = multiplyUnits(m, s);
    expect(ms).toEqual({ num: ["m", "s"], denom: [] });
  });

  it("divides two units", () => {
    const m = unit("m");
    const s = unit("s");
    const mps = divideUnits(m, s);
    expect(mps).toEqual({ num: ["m"], denom: ["s"] });
    expect(formatUnit(mps)).toBe("m/s");
  });

  it("cancels common factors on multiply", () => {
    // (m/s) * (s) = m
    const mps = compoundUnit(["m"], ["s"]);
    const s = unit("s");
    const result = multiplyUnits(mps, s);
    expect(result).toEqual({ num: ["m"], denom: [] });
  });

  it("cancels common factors on divide", () => {
    // m / m = dimensionless
    const m = unit("m");
    const result = divideUnits(m, m);
    expect(unitsEqual(result, dimensionless())).toBe(true);
  });

  it("handles complex cancellation", () => {
    // (kg·m/s²) / (kg) = m/s²
    const newton = compoundUnit(["kg", "m"], ["s", "s"]);
    const kg = unit("kg");
    const result = divideUnits(newton, kg);
    expect(result).toEqual({ num: ["m"], denom: ["s", "s"] });
    expect(formatUnit(result)).toBe("m/s²");
  });
});

// ---------------------------------------------------------------------------
// Unit equality
// ---------------------------------------------------------------------------

describe("unitsEqual", () => {
  it("equal for same units", () => {
    expect(unitsEqual(unit("m"), unit("m"))).toBe(true);
  });

  it("not equal for different units", () => {
    expect(unitsEqual(unit("m"), unit("s"))).toBe(false);
  });

  it("equal for compound units", () => {
    const a = compoundUnit(["kg", "m"], ["s", "s"]);
    const b = compoundUnit(["m", "kg"], ["s", "s"]);
    expect(unitsEqual(a, b)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Dimensional layer propagation
// ---------------------------------------------------------------------------

describe("dimensionalLayer", () => {
  it("propagates through sum (same units → preserved)", () => {
    const a = key<number>("a");
    const b = key<number>("b");
    const c = key<number>("c");

    const m = createModel();
    m.input(a);
    m.input(b);
    m.layer(dimensionalLayer);
    m.annotate(a, "units", unit("m"));
    m.annotate(b, "units", unit("m"));

    m.rule(
      rule({
        target: c,
        deps: [a, b],
        spec: { op: "sum" },
        eval: (get) => ({ output: get(a) + get(b) }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { a: 3, b: 7 });

    expect(result.values.get("c")).toBe(10);
    expect(result.layers.get("units")?.get("a")).toEqual(unit("m"));
    expect(result.layers.get("units")?.get("b")).toEqual(unit("m"));
    expect(result.layers.get("units")?.get("c")).toEqual(unit("m"));
  });

  it("propagates through ratio (m / s → m/s)", () => {
    const distance = key<number>("distance");
    const time = key<number>("time");
    const speed = key<number>("speed");

    const m = createModel();
    m.input(distance);
    m.input(time);
    m.layer(dimensionalLayer);
    m.annotate(distance, "units", unit("m"));
    m.annotate(time, "units", unit("s"));

    m.rule(
      rule({
        target: speed,
        deps: [distance, time],
        spec: { op: "ratio", numerator: "distance", denominator: "time" },
        eval: (get) => ({ output: get(distance) / get(time) }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { distance: 100, time: 2 });

    expect(result.values.get("speed")).toBe(50);
    const speedUnit = result.layers.get("units")?.get("speed") as Unit | undefined;
    expect(speedUnit).toEqual(compoundUnit(["m"], ["s"]));
    expect(formatUnit(speedUnit!)).toBe("m/s");
  });

  it("propagates through scale (m * dimensionless → m)", () => {
    const distance = key<number>("distance");
    const factor = key<number>("factor");
    const scaled = key<number>("scaled");

    const m = createModel();
    m.input(distance);
    m.input(factor);
    m.layer(dimensionalLayer);
    m.annotate(distance, "units", unit("m"));
    m.annotate(factor, "units", dimensionless());

    m.rule(
      rule({
        target: scaled,
        deps: [distance, factor],
        spec: { op: "scale" },
        eval: (get) => ({ output: get(distance) * get(factor) }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { distance: 10, factor: 3 });

    expect(result.values.get("scaled")).toBe(30);
    expect(result.layers.get("units")?.get("scaled")).toEqual(unit("m"));
  });

  it("returns undefined for sum of mismatched units", () => {
    const a = key<number>("a");
    const b = key<number>("b");
    const c = key<number>("c");

    const m = createModel();
    m.input(a);
    m.input(b);
    m.layer(dimensionalLayer);
    m.annotate(a, "units", unit("m"));
    m.annotate(b, "units", unit("s"));

    m.rule(
      rule({
        target: c,
        deps: [a, b],
        spec: { op: "sum" },
        eval: (get) => ({ output: get(a) + get(b) }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { a: 3, b: 7 });

    expect(result.values.get("c")).toBe(10);
    // Mismatched units → undefined (sparse, no error)
    expect(result.layers.get("units")?.get("c")).toBeUndefined();
  });

  it("financial ops preserve monetary unit", () => {
    const pv = key<number>("pv");
    const rate = key<number>("rate");
    const nper = key<number>("nper");
    const fv = key<number>("fv");

    const m = createModel();
    m.input(pv);
    m.input(rate);
    m.input(nper);
    m.layer(dimensionalLayer);
    m.annotate(pv, "units", unit("EUR"));
    m.annotate(rate, "units", dimensionless());
    m.annotate(nper, "units", dimensionless());

    m.rule(
      rule({
        target: fv,
        deps: [pv, rate, nper],
        spec: { op: "future-value", pv: "pv", rate: "rate", nper: "nper" },
        eval: (get) => ({ output: get(pv) * (1 + get(rate)) ** get(nper) }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { pv: 1000, rate: 0.05, nper: 10 });

    expect(result.layers.get("units")?.get("fv")).toEqual(unit("EUR"));
  });

  it("negate preserves unit", () => {
    const a = key<number>("a");
    const b = key<number>("b");

    const m = createModel();
    m.input(a);
    m.layer(dimensionalLayer);
    m.annotate(a, "units", unit("kg"));

    m.rule(
      rule({
        target: b,
        deps: [a],
        spec: { op: "negate" },
        eval: (get) => ({ output: -get(a) }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { a: 5 });

    expect(result.values.get("b")).toBe(-5);
    expect(result.layers.get("units")?.get("b")).toEqual(unit("kg"));
  });

  it("compare returns dimensionless", () => {
    const a = key<number>("a");
    const b = key<boolean>("b");

    const m = createModel();
    m.input(a);
    m.layer(dimensionalLayer);
    m.annotate(a, "units", unit("m"));

    m.rule(
      rule({
        target: b,
        deps: [a],
        spec: { op: "compare" },
        eval: (get) => ({ output: get(a) > 0 }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { a: 5 });

    expect(result.layers.get("units")?.get("b")).toEqual(dimensionless());
  });

  it("full integration: multi-step evaluation with layer inspection", () => {
    const mass = key<number>("mass");
    const acceleration = key<number>("acceleration");
    const force = key<number>("force");
    const time = key<number>("time");
    const impulse = key<number>("impulse");

    const m = createModel();
    m.input(mass);
    m.input(acceleration);
    m.input(time);
    m.layer(dimensionalLayer);
    m.annotate(mass, "units", unit("kg"));
    m.annotate(acceleration, "units", compoundUnit(["m"], ["s", "s"]));
    m.annotate(time, "units", unit("s"));

    // force = mass * acceleration (kg · m/s² = N)
    m.rule(
      rule({
        target: force,
        deps: [mass, acceleration],
        spec: { op: "product" },
        eval: (get) => ({ output: get(mass) * get(acceleration) }),
      }),
    );

    // impulse = force * time (kg·m/s² · s = kg·m/s)
    m.rule(
      rule({
        target: impulse,
        deps: [force, time],
        spec: { op: "product" },
        eval: (get) => ({ output: get(force) * get(time) }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { mass: 10, acceleration: 9.81, time: 2 });

    expect(result.values.get("force")).toBeCloseTo(98.1);
    expect(result.values.get("impulse")).toBeCloseTo(196.2);

    // Force: kg · m/s² = kg·m/s²
    const forceUnit = result.layers.get("units")?.get("force") as Unit | undefined;
    expect(forceUnit).toEqual(compoundUnit(["kg", "m"], ["s", "s"]));
    expect(formatUnit(forceUnit!)).toBe("kg·m/s²");

    // Impulse: kg·m/s² · s = kg·m/s
    const impulseUnit = result.layers.get("units")?.get("impulse") as Unit | undefined;
    expect(impulseUnit).toEqual(compoundUnit(["kg", "m"], ["s"]));
    expect(formatUnit(impulseUnit!)).toBe("kg·m/s");
  });
});
