import { describe, expect, it } from "vitest";
import { analyzeDraft } from "../draft/analysis/analyze-draft";
import { analyzeImpact } from "../draft/analysis/analyze-impact";
import { evaluateDraft } from "../draft/evaluate-draft";
import { freezeEvaluatedDraft } from "../draft/freeze/freeze-evaluated-draft";
import { compileModel, createModel, defaultNumberOps, key, ratio, sum } from "../index";
import { groupDiffByOrigin } from "../overlay/diff-group";
import { deriveOrigins } from "../overlay/evaluate-overlay";
import { explainDiffs } from "../overlay/explain-diff";
import { freezeModel, hydrateModel } from "./freeze-model";
import { downstreamOf, getDeclaredKeys, getDependencies, getDependents, upstreamOf } from "./model";
import { downstreamGraphOf, subgraph, toGraph, upstreamGraphOf } from "./model-graph";

// ---------------------------------------------------------------------------
// Shared model fixture
// ---------------------------------------------------------------------------

const equity = key<number>("equity");
const liabilities = key<number>("liabilities");
const total = key<number>("total");
const equityRatio = key<number>("equityRatio");

const m = createModel();
m.input(equity, { label: "Eigenkapital", group: "PASSIVA" });
m.input(liabilities, { label: "Fremdkapital", group: "PASSIVA" });
m.rule(sum(defaultNumberOps, total, [equity, liabilities]), { label: "Bilanzsumme" });
m.rule(ratio(defaultNumberOps, equityRatio, equity, total), {
  label: "Eigenkapitalquote",
});

const compiled = compileModel(m.build());
if (!compiled.ok) {
  throw new Error(compiled.issues.map((i) => i.message).join(", "));
}
const model = compiled.model;

const draft = {
  draftId: "test-draft",
  base: { equity: 100, liabilities: 25 } as Record<string, unknown>,
  overlay: { liabilities: 10 } as Record<string, unknown>,
};

// ---------------------------------------------------------------------------
// freezeModel / hydrateModel
// ---------------------------------------------------------------------------

describe("freezeModel", () => {
  it("produces a JSON-serializable object", () => {
    const frozen = freezeModel(model);

    // Round-trip through JSON
    const json = JSON.parse(JSON.stringify(frozen));

    expect(json.inputKeys).toEqual(["equity", "liabilities"]);
    expect(json.orderedRuleTargets).toEqual(["total", "equityRatio"]);
    expect(json.depsByTarget.total).toEqual(["equity", "liabilities"]);
    expect(json.depsByTarget.equityRatio).toEqual(["equity", "total"]);
    expect(json.dependentsByKey.equity).toContain("total");
    expect(json.dependentsByKey.equity).toContain("equityRatio");
    expect(json.keyMeta.equity).toEqual({ label: "Eigenkapital", group: "PASSIVA" });
    expect(json.ruleMeta.total).toEqual({ label: "Bilanzsumme" });
  });

  it("preserves all structural fields", () => {
    const frozen = freezeModel(model);

    expect(frozen.inputKeys).toEqual([...model.inputKeys]);
    expect(frozen.orderedRuleTargets).toEqual([...model.orderedRuleTargets]);
  });
});

describe("hydrateModel", () => {
  it("restores Maps from a frozen model", () => {
    const frozen = freezeModel(model);
    const hydrated = hydrateModel(frozen);

    expect(hydrated.depsByTarget).toBeInstanceOf(Map);
    expect(hydrated.dependentsByKey).toBeInstanceOf(Map);
    expect(hydrated.keyMeta).toBeInstanceOf(Map);
    expect(hydrated.ruleMeta).toBeInstanceOf(Map);
  });

  it("round-trips through JSON correctly", () => {
    const frozen = freezeModel(model);
    const json = JSON.parse(JSON.stringify(frozen));
    const hydrated = hydrateModel(json);

    expect(hydrated.inputKeys).toEqual([...model.inputKeys]);
    expect(hydrated.orderedRuleTargets).toEqual([...model.orderedRuleTargets]);
    expect(hydrated.depsByTarget.get("total")).toEqual(["equity", "liabilities"]);
    expect(hydrated.dependentsByKey.get("equity")).toContain("total");
    expect(hydrated.keyMeta.get("equity")).toEqual({ label: "Eigenkapital", group: "PASSIVA" });
    expect(hydrated.ruleMeta.get("total")).toEqual({ label: "Bilanzsumme" });
  });
});

// ---------------------------------------------------------------------------
// Model utility functions work with hydrated frozen model
// ---------------------------------------------------------------------------

describe("model utility functions on hydrated frozen model", () => {
  const hydrated = hydrateModel(JSON.parse(JSON.stringify(freezeModel(model))));

  it("getDependencies", () => {
    expect(getDependencies(hydrated, total.id)).toEqual(getDependencies(model, total.id));
  });

  it("getDependents", () => {
    expect(getDependents(hydrated, equity.id)).toEqual(getDependents(model, equity.id));
  });

  it("getDeclaredKeys", () => {
    expect(getDeclaredKeys(hydrated)).toEqual(getDeclaredKeys(model));
  });

  it("upstreamOf", () => {
    expect(upstreamOf(hydrated, equityRatio.id)).toEqual(upstreamOf(model, equityRatio.id));
  });

  it("downstreamOf", () => {
    expect(downstreamOf(hydrated, equity.id)).toEqual(downstreamOf(model, equity.id));
  });
});

// ---------------------------------------------------------------------------
// Model graph functions work with hydrated frozen model
// ---------------------------------------------------------------------------

describe("model graph functions on hydrated frozen model", () => {
  const hydrated = hydrateModel(JSON.parse(JSON.stringify(freezeModel(model))));

  it("toGraph", () => {
    expect(toGraph(hydrated)).toEqual(toGraph(model));
  });

  it("subgraph", () => {
    const keys = ["equity", "total"];
    expect(subgraph(hydrated, keys)).toEqual(subgraph(model, keys));
  });

  it("upstreamGraphOf", () => {
    expect(upstreamGraphOf(hydrated, equityRatio.id)).toEqual(
      upstreamGraphOf(model, equityRatio.id),
    );
  });

  it("downstreamGraphOf", () => {
    expect(downstreamGraphOf(hydrated, equity.id)).toEqual(downstreamGraphOf(model, equity.id));
  });
});

// ---------------------------------------------------------------------------
// deriveOrigins
// ---------------------------------------------------------------------------

describe("deriveOrigins", () => {
  it("reconstructs origins from model structure and overlay keys", () => {
    const hydrated = hydrateModel(freezeModel(model));
    const origins = deriveOrigins(hydrated, Object.keys(draft.overlay));

    expect(origins.get("equity")).toEqual({ kind: "base" });
    expect(origins.get("liabilities")).toEqual({ kind: "overlay" });
    expect(origins.get("total")).toEqual({ kind: "derived" });
    expect(origins.get("equityRatio")).toEqual({ kind: "derived" });
  });

  it("matches origins from live evaluation", () => {
    const hydrated = hydrateModel(freezeModel(model));
    const evaluated = evaluateDraft(model, draft, "lenient");

    const derived = deriveOrigins(hydrated, Object.keys(draft.overlay));

    for (const [key, origin] of evaluated.result.origins) {
      expect(derived.get(key)).toEqual(origin);
    }
  });
});

// ---------------------------------------------------------------------------
// Full frontend analysis pipeline: frozen model + frozen evaluated draft
// ---------------------------------------------------------------------------

describe("frontend analysis pipeline (frozen model + frozen evaluated draft)", () => {
  // Simulate: server freezes, JSON transport, frontend hydrates
  const frozenModel = JSON.parse(JSON.stringify(freezeModel(model)));
  const evaluated = evaluateDraft(model, draft, "lenient");
  const frozenEvaluated = JSON.parse(JSON.stringify(freezeEvaluatedDraft(model, evaluated)));

  const hydrated = hydrateModel(frozenModel);
  const origins = deriveOrigins(hydrated, Object.keys(frozenEvaluated.overlay));

  it("analyzeImpact produces same result as live path", () => {
    const liveAnalysis = analyzeDraft(model, draft, "lenient");

    const frozenImpact = analyzeImpact(hydrated, origins, frozenEvaluated.deltas);

    expect(frozenImpact.direct).toEqual(liveAnalysis.impact.direct);
    expect(frozenImpact.affected).toEqual(liveAnalysis.impact.affected);
    expect(frozenImpact.terminal).toEqual(liveAnalysis.impact.terminal);
  });

  it("groupDiffByOrigin produces same result as live path", () => {
    const liveAnalysis = analyzeDraft(model, draft, "lenient");

    const frozenGrouped = groupDiffByOrigin({ origins }, frozenEvaluated.deltas);

    expect(frozenGrouped.length).toBe(liveAnalysis.groupedDiffs.length);
    for (let i = 0; i < frozenGrouped.length; i++) {
      expect(frozenGrouped[i].label).toBe(liveAnalysis.groupedDiffs[i].label);
      expect(frozenGrouped[i].deltas.map((d: { key: string }) => d.key)).toEqual(
        liveAnalysis.groupedDiffs[i].deltas.map((d) => d.key),
      );
    }
  });

  it("explainDiffs produces same result as live path", () => {
    const liveAnalysis = analyzeDraft(model, draft, "lenient");

    const frozenChanges = explainDiffs({ trace: frozenEvaluated.trace }, frozenEvaluated.deltas);

    expect(frozenChanges.length).toBe(liveAnalysis.changes.length);
    for (let i = 0; i < frozenChanges.length; i++) {
      expect(frozenChanges[i].delta.key).toBe(liveAnalysis.changes[i].delta.key);
      expect(frozenChanges[i].dependencies?.map((d: { key: string }) => d.key)).toEqual(
        liveAnalysis.changes[i].dependencies?.map((d) => d.key),
      );
      expect(frozenChanges[i].dependencies?.map((d: { changed: boolean }) => d.changed)).toEqual(
        liveAnalysis.changes[i].dependencies?.map((d) => d.changed),
      );
    }
  });

  it("full pipeline: impact + grouping + explanation matches live analyzeDraft", () => {
    const liveAnalysis = analyzeDraft(model, draft, "lenient");

    // Frontend derives everything from frozen data
    const impact = analyzeImpact(hydrated, origins, frozenEvaluated.deltas);
    const groupedDiffs = groupDiffByOrigin({ origins }, frozenEvaluated.deltas);
    const changes = explainDiffs({ trace: frozenEvaluated.trace }, frozenEvaluated.deltas);

    // Verify equivalence
    expect(impact).toEqual(liveAnalysis.impact);
    expect(groupedDiffs.map((g: { label: string }) => g.label)).toEqual(
      liveAnalysis.groupedDiffs.map((g) => g.label),
    );
    expect(changes.length).toBe(liveAnalysis.changes.length);
  });
});
