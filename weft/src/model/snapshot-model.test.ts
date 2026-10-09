import { describe, expect, it } from "vitest";
import {
  compileModel,
  createModel,
  defaultNumberOps,
  key,
  ratio,
  rule,
  sum,
  value,
} from "../index";
import type { KeySemantics } from "../key";
import type { LayerEvaluator } from "../layer";
import { fingerprintValue } from "../snapshot/fingerprint";
import type { Model } from ".";
import { freezeModel } from "./freeze-model";
import { snapshotFrozenModel, snapshotModel } from "./snapshot-model";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function compileOrFail(model: Model) {
  const result = compileModel(model);
  if (!result.ok) {
    throw new Error(`Compile failed: ${result.issues.map((i) => i.message).join(", ")}`);
  }
  return result.model;
}

/** The fingerprint of a compiled model, as `createFrozenSnapshot` computes it. */
function fingerprint(model: Model): string {
  return fingerprintValue(snapshotModel(compileOrFail(model)));
}

const unitsLayer = (version: string): LayerEvaluator<string> => ({
  name: "units",
  version,
  eval: () => "m",
});

// ---------------------------------------------------------------------------
// snapshotFrozenModel
// ---------------------------------------------------------------------------

describe("snapshotFrozenModel", () => {
  const equity = key<number>("equity");
  const liabilities = key<number>("liabilities");
  const total = key<number>("total");
  const ratioOut = key<number>("ratioOut");

  function baseModel() {
    const m = createModel({ version: "1" });
    m.input(equity, { label: "Equity" });
    m.input(liabilities, { label: "Liabilities" });
    m.rule(sum(defaultNumberOps, total, [equity, liabilities]), { label: "Total" });
    m.rule(ratio(defaultNumberOps, ratioOut, equity, total), { label: "Ratio" });
    return m;
  }

  it("includes every structural field a frozen model carries", () => {
    const frozen = freezeModel(compileOrFail(baseModel().build()));
    const snapshot = snapshotFrozenModel(frozen);

    expect(snapshot).toMatchObject({
      version: "1",
      inputKeys: ["equity", "liabilities"],
      orderedRuleTargets: ["total", "ratioOut"],
      keyMeta: { equity: { label: "Equity" } },
      depsByTarget: { total: ["equity", "liabilities"], ratioOut: ["equity", "total"] },
    });

    // Rules are projected in topological order, each carrying the rule's full
    // spec — so an ops descriptor change or a changed literal reaches the hash.
    const snap = snapshot as Record<string, unknown>;
    const rules = snap.rules as Array<{ target: string; spec: Record<string, unknown> }>;
    expect(rules.map((r) => r.target)).toEqual(["total", "ratioOut"]);
    expect(rules[0].spec).toEqual(frozen.ruleSpecs.total);
    expect(rules[1].spec).toEqual(frozen.ruleSpecs.ratioOut);
    expect(rules[0].spec.opsDescriptor).toEqual({ family: "default/number", version: "1" });
    expect(snap.dependentsByKey).toEqual(frozen.dependentsByKey);
  });

  it("omits every optional field the model does not have", () => {
    const snapshot = snapshotFrozenModel(freezeModel(compileOrFail(baseModel().build())));

    expect(snapshot).not.toHaveProperty("jsonSchemas");
    expect(snapshot).not.toHaveProperty("keyValueTypes");
    expect(snapshot).not.toHaveProperty("constraints");
    expect(snapshot).not.toHaveProperty("layers");
  });

  it("omits `version` when the model declares none", () => {
    const m = createModel();
    m.input(equity);
    m.input(liabilities);
    m.rule(sum(defaultNumberOps, total, [equity, liabilities]));

    expect(snapshotFrozenModel(freezeModel(compileOrFail(m.build())))).not.toHaveProperty(
      "version",
    );
  });

  it("projects layer name, version, and input annotations", () => {
    const m = baseModel();
    m.layer(unitsLayer("1"));
    m.annotate(equity, "units", "EUR");

    const snapshot = snapshotFrozenModel(freezeModel(compileOrFail(m.build())));

    // `inputs` are included because `evaluate` seeds each layer's value map from
    // them, so differing annotations mean differing layer outputs.
    expect(snapshot).toHaveProperty("layers", [
      { name: "units", version: "1", inputs: { equity: "EUR" } },
    ]);
  });

  it("survives a JSON round-trip unchanged", () => {
    const m = baseModel();
    m.layer(unitsLayer("1"));
    m.annotate(equity, "units", "EUR");
    const frozen = freezeModel(compileOrFail(m.build()));

    const before = snapshotFrozenModel(frozen);
    const after = snapshotFrozenModel(JSON.parse(JSON.stringify(frozen)));

    expect(after).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// snapshotModel
// ---------------------------------------------------------------------------

describe("snapshotModel", () => {
  const a = key<number>("a");
  const b = key<number>("b");
  const c = key<number>("c");

  it("is defined as the frozen projection, so the two cannot disagree", () => {
    const m = createModel({ version: "7" });
    m.input(a);
    m.input(b);
    m.rule(sum(defaultNumberOps, c, [a, b]));
    const compiled = compileOrFail(m.build());

    expect(snapshotModel(compiled)).toEqual(snapshotFrozenModel(freezeModel(compiled)));
  });
});

// ---------------------------------------------------------------------------
// What drift the fingerprint does and does not catch
// ---------------------------------------------------------------------------

describe("modelFingerprint coverage", () => {
  const a = key<number>("a");
  const b = key<number>("b");
  const c = key<number>("c");

  describe("live-callback drift is invisible without an explicit version", () => {
    // Two models, identical specs, different arithmetic. `rule()` is used
    // directly so the bodies can differ while the spec stays the same.
    function withEval(multiplier: number) {
      const m = createModel();
      m.input(a);
      m.input(b);
      m.rule(
        rule({
          target: c,
          deps: [a, b],
          spec: { op: "sum" },
          eval: (get) => ({ output: (get(a) + get(b)) * multiplier }),
        }),
      );
      return m;
    }

    it("gives the same fingerprint to g(a)*2 and g(a)*999", () => {
      // This is the honest limit, and the reason `createModel({ version })`
      // exists. Rule bodies are live functions and never enter a hash —
      // hashing `fn.toString()` would miss closure capture and vary with the
      // bundler, so the author declares a version instead.
      expect(fingerprint(withEval(2).build())).toBe(fingerprint(withEval(999).build()));
    });

    it("gives the same fingerprint across an ops algebra swap that keeps the descriptor", () => {
      const m = createModel();
      m.input(a);
      m.input(b);
      m.rule(ratio(defaultNumberOps, c, a, b));
      const model = m.build();

      const swapped = createModel();
      swapped.input(a);
      swapped.input(b);
      swapped.rule(ratio({ ...defaultNumberOps, div: (x: number, y: number) => y / x }, c, a, b));

      // Same `opsDescriptor` in the spec, different division. Undetected —
      // again by design; see `ModelOptions.version`.
      expect(fingerprint(model)).toBe(fingerprint(swapped.build()));
    });

    it("gives a different fingerprint once the author bumps the version", () => {
      function versioned(version: string, multiplier: number) {
        const m = createModel({ version });
        m.input(a);
        m.input(b);
        m.rule(
          rule({
            target: c,
            deps: [a, b],
            spec: { op: "sum" },
            eval: (get) => ({ output: (get(a) + get(b)) * multiplier }),
          }),
        );
        return m.build();
      }

      expect(fingerprint(versioned("2", 2))).toBe(fingerprint(versioned("2", 999)));
      expect(fingerprint(versioned("1", 2))).not.toBe(fingerprint(versioned("2", 2)));
    });
    it("gives the same fingerprint once only the key semantics differ", () => {
      // `KeySemantics` callbacks are live functions and absent from FrozenModel,
      // exactly like `eval` bodies. They are not a lesser case: `normalize`
      // decides whether an overlay survives, `eq` whether a delta is emitted,
      // and `encode` the shape of every frozen value. None of that is derivable
      // from the frozen shape, so none of it can move the fingerprint — which is
      // why `createModel({ version })` is the contract for all of them, not just
      // arithmetic. Pinned so the documented scope cannot quietly narrow again.
      const s = key<string>("s");

      function withSemantics(semantics: Partial<KeySemantics<string>>) {
        const m = createModel();
        m.input(s, { label: "S" }, semantics);
        return m.build();
      }

      const identity = withSemantics({
        normalize: (v) => v,
        eq: (x, y) => x === y,
        encode: (v) => v.trim(),
      });
      const lossy = withSemantics({
        normalize: (v) => v.toUpperCase(),
        eq: () => false,
        encode: (v) => String(v).trim(),
      });

      expect(fingerprint(identity)).toBe(fingerprint(lossy));
    });

    it("separates them once the author bumps the version", () => {
      const s = key<string>("s");

      function versioned(version: string) {
        const m = createModel({ version });
        m.input(s, { label: "S" }, { eq: () => false });
        return m.build();
      }

      expect(fingerprint(versioned("1"))).not.toBe(fingerprint(versioned("2")));
    });
  });

  describe("structural drift is detected", () => {
    function withMeta(label: string) {
      const m = createModel({ version: "1" });
      m.input(a, { label });
      m.input(b);
      m.rule(sum(defaultNumberOps, c, [a, b]));
      return m.build();
    }

    it("detects a changed key label", () => {
      expect(fingerprint(withMeta("Alpha"))).not.toBe(fingerprint(withMeta("Beta")));
    });

    it("detects a changed ops descriptor", () => {
      const plain = createModel();
      plain.input(a);
      plain.input(b);
      plain.rule(ratio(defaultNumberOps, c, a, b));

      const bumped = createModel();
      bumped.input(a);
      bumped.input(b);
      bumped.rule(ratio({ ...defaultNumberOps, version: "2" }, c, a, b));

      expect(fingerprint(plain.build())).not.toBe(fingerprint(bumped.build()));
    });

    it("detects added and removed inputs", () => {
      const one = createModel();
      one.input(a);
      one.input(b);
      one.rule(sum(defaultNumberOps, c, [a, b]));

      const two = createModel();
      two.input(a);
      two.input(b);
      two.input(key<number>("extra"));
      two.rule(sum(defaultNumberOps, c, [a, b]));

      expect(fingerprint(one.build())).not.toBe(fingerprint(two.build()));
    });

    it("detects a changed literal in a spec", () => {
      const two = createModel();
      two.input(a);
      two.input(b);
      two.rule(ratio(defaultNumberOps, c, a, b));

      const seven = createModel();
      seven.input(a);
      seven.input(b);
      seven.rule(ratio(defaultNumberOps, c, a, value(7)));

      expect(fingerprint(two.build())).not.toBe(fingerprint(seven.build()));
    });

    it("detects a changed dependency topology", () => {
      const chained = createModel();
      chained.input(a);
      chained.input(b);
      chained.rule(sum(defaultNumberOps, c, [a, b]));

      const direct = createModel();
      direct.input(a);
      direct.input(b);
      const d = key<number>("d");
      direct.rule(sum(defaultNumberOps, d, [a, b]));
      direct.rule(sum(defaultNumberOps, c, [d, b]));

      expect(fingerprint(chained.build())).not.toBe(fingerprint(direct.build()));
    });

    it("detects a bump to a layer's version", () => {
      function withLayer(version: string) {
        const m = createModel();
        m.input(a);
        m.input(b);
        m.rule(sum(defaultNumberOps, c, [a, b]));
        m.layer(unitsLayer(version));
        return m.build();
      }

      // The 0.7.0 dimensional-layer fix: `units` v1 bags are not comparable to
      // `units` v2 bags, so the version must move the fingerprint.
      expect(fingerprint(withLayer("1"))).not.toBe(fingerprint(withLayer("2")));
    });

    it("detects changed layer input annotations", () => {
      function withAnnotation(unit: string) {
        const m = createModel();
        m.input(a);
        m.input(b);
        m.rule(sum(defaultNumberOps, c, [a, b]));
        m.layer(unitsLayer("1"));
        m.annotate(a, "units", unit);
        return m.build();
      }

      // `evaluate` seeds each layer's value map from `layerInputs`, so these two
      // models produce different layer outputs for the same rules. Same layer
      // name and version — only the annotations differ.
      expect(fingerprint(withAnnotation("EUR"))).not.toBe(fingerprint(withAnnotation("USD")));
    });

    it("detects an added layer input annotation", () => {
      const annotated = createModel();
      annotated.input(a);
      annotated.input(b);
      annotated.rule(sum(defaultNumberOps, c, [a, b]));
      annotated.layer(unitsLayer("1"));
      annotated.annotate(a, "units", "EUR");

      const bare = createModel();
      bare.input(a);
      bare.input(b);
      bare.rule(sum(defaultNumberOps, c, [a, b]));
      bare.layer(unitsLayer("1"));

      expect(fingerprint(annotated.build())).not.toBe(fingerprint(bare.build()));
    });

    it("detects a removed layer", () => {
      const withL = createModel();
      withL.input(a);
      withL.input(b);
      withL.rule(sum(defaultNumberOps, c, [a, b]));
      withL.layer(unitsLayer("1"));

      const without = createModel();
      without.input(a);
      without.input(b);
      without.rule(sum(defaultNumberOps, c, [a, b]));

      expect(fingerprint(withL.build())).not.toBe(fingerprint(without.build()));
    });

    it("is stable for two identical models", () => {
      function build() {
        const m = createModel({ version: "3" });
        m.input(a, { label: "A", order: 1 });
        m.input(b, { label: "B" });
        m.rule(sum(defaultNumberOps, c, [a, b]), { label: "C" });
        m.layer(unitsLayer("2"));
        return m.build();
      }

      expect(fingerprint(build())).toBe(fingerprint(build()));
    });
  });
});
