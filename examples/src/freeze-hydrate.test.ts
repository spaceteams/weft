import {
  analyzeFrozenDraft,
  compileModel,
  createModel,
  defaultNumberOps,
  evaluateDraft,
  freezeEvaluatedDraft,
  freezeModel,
  hydrateModel,
  inspectionNodeToAscii,
  inspectTraceTarget,
  key,
  ratio,
  sum,
} from "@spaceteams/weft";
import { describe, expect, it } from "vitest";

describe("freeze / hydrate — server-to-client flow", () => {
  // Build a simple model
  const revenue = key<number>("revenue");
  const costs = key<number>("costs");
  const profit = key<number>("profit");
  const margin = key<number>("margin");

  const m = createModel();
  m.input(revenue, { label: "Revenue" });
  m.input(costs, { label: "Costs" });
  m.rule(sum(defaultNumberOps, profit, [revenue, costs]), { label: "Profit" });
  // note: costs are negative, so sum gives revenue + costs = profit
  m.rule(ratio(defaultNumberOps, margin, profit, revenue), { label: "Margin" });

  const compiled = compileModel(m.build());
  if (!compiled.ok) throw new Error(compiled.issues.map((i) => i.message).join());
  const model = compiled.model;

  // ── Server side ──────────────────────────────────────────────────────

  it("server: freeze model and evaluated draft", () => {
    // 1. Freeze the compiled model (structural data, no live functions)
    const frozenModel = freezeModel(model);

    // frozenModel is JSON-safe — contains inputKeys, dependency graph,
    // rule specs, key metadata, but NO eval functions
    expect(frozenModel.inputKeys).toContain("revenue");
    expect(frozenModel.inputKeys).toContain("costs");
    expect(frozenModel.orderedRuleTargets).toEqual(["profit", "margin"]);

    // 2. Evaluate a draft (base scenario + what-if overlay)
    const evaluated = evaluateDraft(
      model,
      {
        draftId: "q3-optimistic",
        base: { revenue: 1000, costs: -600 },
        overlay: { revenue: 1500 },
      },
      "lenient",
    );

    // 3. Freeze the evaluated draft (values, deltas, trace — all canonical)
    const frozenDraft = freezeEvaluatedDraft(model, evaluated);

    // frozenDraft is JSON-safe — contains snapshot fingerprints,
    // base/overlay/effective values, deltas, and canonical trace
    expect(frozenDraft.version).toBeGreaterThan(0);
    expect(frozenDraft.deltas.length).toBeGreaterThan(0);
    expect(frozenDraft.trace.length).toBe(2); // profit + margin
  });

  // ── Wire transfer (JSON round-trip) ──────────────────────────────────

  it("round-trip: freeze → JSON → parse", () => {
    const frozenModel = freezeModel(model);
    const evaluated = evaluateDraft(
      model,
      {
        draftId: "q3-optimistic",
        base: { revenue: 1000, costs: -600 },
        overlay: { revenue: 1500 },
      },
      "lenient",
    );
    const frozenDraft = freezeEvaluatedDraft(model, evaluated);

    // Simulate sending over the wire
    const modelJson = JSON.parse(JSON.stringify(frozenModel));
    const draftJson = JSON.parse(JSON.stringify(frozenDraft));

    // Client reconstructs full analysis without the compiled model
    const analysis = analyzeFrozenDraft(modelJson, draftJson);

    // Impact analysis tells us what changed
    expect(analysis.impact.direct).toEqual(["revenue"]);
    expect(analysis.impact.affected).toContain("profit");
    expect(analysis.impact.affected).toContain("margin");

    // Changes include explained diffs with before/after
    expect(analysis.changes.length).toBeGreaterThan(0);
    const profitChange = analysis.changes.find((c) => c.delta.key === "profit");
    expect(profitChange).toBeDefined();

    // Grouped diffs separate overlay inputs from derived effects
    expect(analysis.groupedDiffs.length).toBeGreaterThan(0);
  });

  // ── Client-side inspection ───────────────────────────────────────────

  it("client: inspect frozen trace without compiled model", () => {
    const frozenModel = freezeModel(model);
    const evaluated = evaluateDraft(
      model,
      {
        draftId: "q3-optimistic",
        base: { revenue: 1000, costs: -600 },
        overlay: { revenue: 1500 },
      },
      "lenient",
    );
    const frozenDraft = freezeEvaluatedDraft(model, evaluated);

    // Simulate client receiving JSON
    const modelJson = JSON.parse(JSON.stringify(frozenModel));
    const draftJson = JSON.parse(JSON.stringify(frozenDraft));

    // Hydrate model structure (no eval functions, just structural data)
    const structure = hydrateModel(modelJson);

    // Inspect the frozen trace — identical output to live inspection
    const tree = inspectTraceTarget(structure, draftJson.trace, margin.id);
    const ascii = inspectionNodeToAscii(tree, { showMeta: true, showChange: false });

    expect(ascii).toMatchInlineSnapshot(`
      "└── Margin [ratio] = 0.6
          ├── Profit [sum] = 900
          │   ├── Revenue [input] = 1500
          │   └── Costs [input] = -600
          └── Revenue [input] = 1500"
    `);
  });

  // ── Verify live vs frozen parity ─────────────────────────────────────

  it("frozen inspection matches live inspection", () => {
    const frozenModel = freezeModel(model);
    const evaluated = evaluateDraft(
      model,
      {
        draftId: "q3-optimistic",
        base: { revenue: 1000, costs: -600 },
        overlay: { revenue: 1500 },
      },
      "lenient",
    );
    const frozenDraft = freezeEvaluatedDraft(model, evaluated);

    // Live path
    const liveTree = inspectTraceTarget(model, evaluated.result.trace, margin.id);
    const liveAscii = inspectionNodeToAscii(liveTree, { showMeta: true, showChange: false });

    // Frozen path (simulating client)
    const structure = hydrateModel(JSON.parse(JSON.stringify(frozenModel)));
    const frozenTree = inspectTraceTarget(
      structure,
      JSON.parse(JSON.stringify(frozenDraft)).trace,
      margin.id,
    );
    const frozenAscii = inspectionNodeToAscii(frozenTree, {
      showMeta: true,
      showChange: false,
    });

    // Identical output — clients see exactly what the server computed
    expect(frozenAscii).toBe(liveAscii);
  });
});
