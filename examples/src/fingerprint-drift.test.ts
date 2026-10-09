import type { FrozenModel, LayerEvaluator } from "@spaceteams/weft";
import {
  CURRENT_FINGERPRINT_VERSION,
  compileModel,
  createDraft,
  createModel,
  defaultNumberOps,
  evaluateDraft,
  fingerprintValue,
  freezeEvaluatedDraft,
  freezeModel,
  key,
  parseFrozenArtifact,
  ratio,
  snapshotFrozenModel,
  snapshotModel,
  sum,
  validateFrozenArtifact,
} from "@spaceteams/weft";
import { describe, expect, it } from "vitest";

/**
 * Fingerprints are only useful if a consumer can recompute them. This is the
 * flow that was impossible before: a client holding two JSON artifacts, no
 * server round-trip, and no access to the model's live rule functions.
 */

const revenue = key<number>("revenue");
const costs = key<number>("costs");
const profit = key<number>("profit");
const margin = key<number>("margin");

const unitsLayer = (version: string): LayerEvaluator<string> => ({
  name: "units",
  version,
  eval: () => "EUR",
});

function buildModel(options: { version?: string }) {
  const m = createModel(options);
  m.input(revenue, { label: "Revenue" });
  m.input(costs, { label: "Costs" });
  // costs are negative, so this is revenue + costs = profit
  m.rule(sum(defaultNumberOps, profit, [revenue, costs]), { label: "Profit" });
  m.rule(ratio(defaultNumberOps, margin, profit, revenue), { label: "Margin" });
  return m;
}

function compileOrFail(options: { version?: string }) {
  const result = compileModel(buildModel(options).build());
  if (!result.ok) throw new Error(`Compile failed: ${result.issues.map((i) => i.message).join()}`);
  return result.model;
}

/** Simulate a server response: both artifacts go over the wire as JSON. */
function shipOverTheWire(options: { version?: string }) {
  const model = compileOrFail(options);
  const draft = createDraft("d-1", { revenue: 1000, costs: -400 }, { costs: -500 });
  const evaluated = evaluateDraft(model, draft);
  return {
    frozenModel: JSON.parse(JSON.stringify(freezeModel(model))) as FrozenModel,
    frozenDraft: JSON.parse(JSON.stringify(freezeEvaluatedDraft(model, evaluated))),
  };
}

describe("client-side fingerprint verification", () => {
  it("recomputes modelFingerprint from the frozen model alone", () => {
    const { frozenModel, frozenDraft } = shipOverTheWire({ version: "1" });

    // The client parses the draft the way a real consumer would, then derives
    // the model fingerprint from the frozen model it was shipped alongside.
    const parsed = parseFrozenArtifact(frozenDraft);

    expect(fingerprintValue(snapshotFrozenModel(frozenModel))).toBe(
      parsed.snapshot.modelFingerprint,
    );
  });

  it("verifies an artifact with no server round-trip", () => {
    const { frozenModel, frozenDraft } = shipOverTheWire({ version: "1" });

    const problems = validateFrozenArtifact(frozenDraft);
    expect(problems).toEqual([]);

    const recomputed = fingerprintValue(snapshotFrozenModel(frozenModel));
    const stored = (frozenDraft as { snapshot: { modelFingerprint: string } }).snapshot
      .modelFingerprint;

    expect(recomputed).toBe(stored);
  });

  it("detects a mismatched model/artifact pair", () => {
    const model = shipOverTheWire({ version: "1" });
    const other = shipOverTheWire({ version: "2" });

    // A client can now tell that these two artifacts came from different
    // behaviour revisions — the thing `fn.toString()` cannot do.
    expect(model.frozenDraft.snapshot.modelFingerprint).not.toBe(
      other.frozenDraft.snapshot.modelFingerprint,
    );
  });

  it("detects structural drift between two models", () => {
    const plain = compileOrFail({ version: "1" });

    const relabelled = createModel({ version: "1" });
    relabelled.input(revenue, { label: "Turnover" });
    relabelled.input(costs, { label: "Costs" });
    relabelled.rule(sum(defaultNumberOps, profit, [revenue, costs]), { label: "Profit" });
    relabelled.rule(ratio(defaultNumberOps, margin, profit, revenue), { label: "Margin" });
    const relabelledResult = compileModel(relabelled.build());
    if (!relabelledResult.ok) throw new Error("compile failed");

    expect(fingerprintValue(snapshotFrozenModel(freezeModel(plain)))).not.toBe(
      fingerprintValue(snapshotFrozenModel(freezeModel(relabelledResult.model))),
    );
  });

  it("gives the same answer from the compiled model as from the frozen one", () => {
    const model = compileOrFail({ version: "4" });

    expect(fingerprintValue(snapshotModel(model))).toBe(
      fingerprintValue(snapshotFrozenModel(freezeModel(model))),
    );
  });

  it("detects drift in layer input annotations", () => {
    // Annotations seed each layer's value map during evaluation, so two models
    // differing only here produce different layer outputs.
    function withUnits(unit: string) {
      const m = createModel({ version: "1" });
      m.input(revenue, { label: "Revenue" });
      m.input(costs, { label: "Costs" });
      m.rule(sum(defaultNumberOps, profit, [revenue, costs]), { label: "Profit" });
      m.rule(ratio(defaultNumberOps, margin, profit, revenue), { label: "Margin" });
      m.layer(unitsLayer("1"));
      m.annotate(revenue, "units", unit);
      const compiled = compileModel(m.build());
      if (!compiled.ok) throw new Error("compile failed");
      return fingerprintValue(snapshotFrozenModel(freezeModel(compiled.model)));
    }

    expect(withUnits("EUR")).not.toBe(withUnits("USD"));
  });
});

describe("comparing two artifacts", () => {
  it("stamps the current fingerprint version on a natively frozen artifact", () => {
    const { frozenDraft } = shipOverTheWire({ version: "1" });

    expect(frozenDraft.snapshot.fingerprintVersion).toBe(CURRENT_FINGERPRINT_VERSION);
  });

  it("refuses to treat a migrated artifact as comparable to a native one", () => {
    const native = shipOverTheWire({ version: "1" }).frozenDraft;

    // A pre-v4 artifact, as it would arrive from storage. `parseFrozenArtifact`
    // migrates it to the current schema version — but the snapshot records which
    // fingerprint projection actually produced its digests, and that value is
    // left alone by migration.
    const legacy = {
      ...native,
      version: 3,
      snapshot: { ...native.snapshot, fingerprintVersion: 3 },
    };
    const parsed = parseFrozenArtifact(legacy);

    // The artifact version has converged, which is exactly why it cannot be the
    // discriminator.
    expect(parsed.version).toBe(native.version);
    expect(parsed.snapshot.fingerprintVersion).not.toBe(native.snapshot.fingerprintVersion);

    // So the gate a consumer should apply:
    const comparable = parsed.snapshot.fingerprintVersion === native.snapshot.fingerprintVersion;
    expect(comparable).toBe(false);
  });

  it("reports comparable when both artifacts share a fingerprint version", () => {
    const a = shipOverTheWire({ version: "1" }).frozenDraft;
    const b = shipOverTheWire({ version: "1" }).frozenDraft;

    expect(a.snapshot.fingerprintVersion).toBe(b.snapshot.fingerprintVersion);
    // Same version and same model, so the digests match outright.
    expect(a.snapshot.modelFingerprint).toBe(b.snapshot.modelFingerprint);
  });
});

describe("modelFingerprint — behaviour version", () => {
  it("catches arithmetic drift once `version` is bumped", () => {
    // Rule bodies are live functions and never enter a hash — closure capture is
    // invisible to `fn.toString()`, and minified output varies by bundler — so
    // `createModel({ version })` is the supported channel for behaviour drift.
    // See `weft/src/model/snapshot-model.test.ts` for the arithmetic-drift case
    // this version string exists to cover.
    const v1 = compileOrFail({ version: "1" });
    const v2 = compileOrFail({ version: "2" });

    expect(fingerprintValue(snapshotModel(v1))).not.toBe(fingerprintValue(snapshotModel(v2)));
  });
});
