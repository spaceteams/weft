import {
  analyzeDraft,
  compileModel,
  createModel,
  defaultNumberOps,
  evaluateOverlay,
  inspectDiffTarget,
  inspectionNodeToAscii,
  key,
  ratio,
  sum,
} from "@spaceteams/weft";
import { describe, expect, it } from "vitest";

// A balance sheet model — simple enough to focus on draft analysis
const equity = key<number>("equity");
const liabilities = key<number>("liabilities");
const total = key<number>("total");
const equityRatio = key<number>("equityRatio");

const m = createModel();
m.input(equity, { label: "Eigenkapital", group: "PASSIVA" });
m.input(liabilities, { label: "Fremdkapital", group: "PASSIVA" });
m.rule(sum(defaultNumberOps, total, [equity, liabilities]), { label: "Bilanzsumme" });
m.rule(ratio(defaultNumberOps, equityRatio, equity, total), { label: "Eigenkapitalquote" });

const compiled = compileModel(m.build());
if (!compiled.ok) {
  throw new Error(compiled.issues.map((i) => i.message).join());
}
const model = compiled.model;

describe("what-if overlay analysis", () => {
  it("evaluates an overlay and tracks value origins", () => {
    const result = evaluateOverlay(model, { equity: 100, liabilities: 25 }, { liabilities: 10 });

    // Overlay replaces liabilities: 25 → 10
    expect(result.values.get("total")).toBe(110);
    expect(result.values.get("equityRatio")).toBeCloseTo(0.909, 2);

    // Origins tell you where each value came from
    expect(result.origins.get("equity")?.kind).toBe("base");
    expect(result.origins.get("liabilities")?.kind).toBe("overlay");
    expect(result.origins.get("total")?.kind).toBe("derived");
    expect(result.origins.get("equityRatio")?.kind).toBe("derived");
  });
});

describe("draft analysis — full impact pipeline", () => {
  const draft = {
    draftId: "reduce-debt",
    base: { equity: 100, liabilities: 25 },
    overlay: { liabilities: 10 },
  };

  it("identifies direct, affected, and terminal keys", () => {
    const { impact } = analyzeDraft(model, draft, "lenient");

    // direct: keys changed in the overlay
    expect(impact.direct).toEqual(["liabilities"]);
    // affected: computed keys whose values changed as a result
    expect(impact.affected).toEqual(["total", "equityRatio"]);
    // terminal: affected keys with no further dependents
    expect(impact.terminal).toEqual(["equityRatio"]);
  });

  it("groups diffs by origin (overlay vs derived)", () => {
    const { groupedDiffs } = analyzeDraft(model, draft, "lenient");

    // Diffs are grouped: overlay changes first, then derived effects
    const overlayGroup = groupedDiffs.find((g) => g.label === "Overlay inputs");
    const derivedGroup = groupedDiffs.find((g) => g.label === "Derived values");

    expect(overlayGroup).toBeDefined();
    expect(overlayGroup!.deltas.map((d) => d.key)).toEqual(["liabilities"]);

    expect(derivedGroup).toBeDefined();
    expect(derivedGroup!.deltas.map((d) => d.key)).toContain("total");
    expect(derivedGroup!.deltas.map((d) => d.key)).toContain("equityRatio");
  });

  it("explains changes with before/after and trace context", () => {
    const { changes } = analyzeDraft(model, draft, "lenient");

    // Each change includes the delta plus human-readable explanation
    const totalChange = changes.find((c) => c.delta.key === "total");
    expect(totalChange).toBeDefined();
    expect(totalChange!.delta.kind).toBe("changed");
    if (totalChange!.delta.kind === "changed") {
      expect(totalChange!.delta.before).toBe(125);
      expect(totalChange!.delta.after).toBe(110);
    }
  });

  it("renders diff inspection tree with before → after annotations", () => {
    const { evaluated, changes } = analyzeDraft(model, draft, "lenient");

    expect(
      inspectionNodeToAscii(inspectDiffTarget(model, evaluated.result, changes, equityRatio.id), {
        showChange: true,
        showMeta: true,
      }),
    ).toMatchInlineSnapshot(`
      "└── Eigenkapitalquote [ratio] = 0.8 -> 0.9090909090909091 (changed)
          ├── Eigenkapital [input] = 100
          └── Bilanzsumme [sum] = 125 -> 110 (changed)
              ├── Eigenkapital [input] = 100
              └── Fremdkapital [input] = 25 -> 10 (changed)"
    `);
  });
});
