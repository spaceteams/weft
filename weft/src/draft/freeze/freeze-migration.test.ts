import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileModel, createModel, defaultNumberOps, key, ratio, sum } from "../../index";
import { inspectTraceTarget } from "../../inspect/inspect-trace-target";
import { inspectionNodeToAscii } from "../../inspect/inspection-node-to-ascii";
import { evaluateDraft } from "../evaluate-draft";
import { freezeEvaluatedDraft } from "./freeze-evaluated-draft";
import { migrateFrozenArtifact } from "./migrate";
import { parseFrozenArtifact } from "./parse";
import { CURRENT_FROZEN_VERSION } from "./version";

// ---------------------------------------------------------------------------
// Shared model fixture (same model used to generate the golden v0 JSON files)
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
  draftId: "v0-fixture",
  base: { equity: 100, liabilities: 25 } as Record<string, unknown>,
  overlay: { liabilities: 10 } as Record<string, unknown>,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadFixture(name: string): Record<string, unknown> {
  const path = new URL(`./__fixtures__/${name}`, import.meta.url).pathname;
  return JSON.parse(readFileSync(path, "utf-8"));
}

// ---------------------------------------------------------------------------
// Migration: v0 → v1
// ---------------------------------------------------------------------------

describe("migrateFrozenArtifact", () => {
  it("v0 evaluated fixture migrates to current version", () => {
    const v0 = loadFixture("v0-evaluated.json");

    expect(v0).not.toHaveProperty("version");

    const migrated = migrateFrozenArtifact(v0);

    expect(migrated.version).toBe(CURRENT_FROZEN_VERSION);
    expect(migrated.trace).toBeDefined();
    expect(migrated.draftId).toBe("v0-fixture");
  });

  it("backfills trace as empty array when missing", () => {
    const v0 = loadFixture("v0-evaluated.json");
    // Simulate a truly old artifact that predates trace
    delete v0.trace;

    const migrated = migrateFrozenArtifact(v0);

    expect(migrated.trace).toEqual([]);
  });

  it("preserves existing trace when present", () => {
    const v0 = loadFixture("v0-evaluated.json");
    const originalTrace = v0.trace;
    expect(Array.isArray(originalTrace)).toBe(true);
    expect((originalTrace as unknown[]).length).toBeGreaterThan(0);

    const migrated = migrateFrozenArtifact(v0);

    expect(migrated.trace).toEqual(originalTrace);
  });

  it("is a no-op for artifacts already at current version", () => {
    const evaluated = evaluateDraft(model, draft, "lenient");
    const frozen = freezeEvaluatedDraft(model, evaluated);
    const asRecord = JSON.parse(JSON.stringify(frozen)) as Record<string, unknown>;

    const migrated = migrateFrozenArtifact(asRecord);

    expect(migrated.version).toBe(CURRENT_FROZEN_VERSION);
  });

  it("throws for artifacts newer than current version", () => {
    const artifact = { version: 999, draftId: "future" };

    expect(() => migrateFrozenArtifact(artifact)).toThrow(
      /version 999 is newer than the current version/,
    );
  });
});

// ---------------------------------------------------------------------------
// parseFrozenArtifact
// ---------------------------------------------------------------------------

describe("parseFrozenArtifact", () => {
  it("parses v0 evaluated fixture", () => {
    const v0 = loadFixture("v0-evaluated.json");
    const parsed = parseFrozenArtifact(v0);

    expect(parsed.draftId).toBe("v0-fixture");
    expect(parsed.version).toBe(CURRENT_FROZEN_VERSION);
  });

  it("rejects null", () => {
    expect(() => parseFrozenArtifact(null)).toThrow("non-null object");
  });

  it("rejects arrays", () => {
    expect(() => parseFrozenArtifact([])).toThrow("non-null object");
  });

  it("rejects primitives", () => {
    expect(() => parseFrozenArtifact("hello")).toThrow("non-null object");
  });
});

// ---------------------------------------------------------------------------
// Current freeze output includes version
// ---------------------------------------------------------------------------

describe("current freeze output", () => {
  it("freezeEvaluatedDraft includes version", () => {
    const evaluated = evaluateDraft(model, draft, "lenient");
    const frozen = freezeEvaluatedDraft(model, evaluated);

    expect(frozen.version).toBe(CURRENT_FROZEN_VERSION);
  });
});

// ---------------------------------------------------------------------------
// Migrated v0 artifacts work with the inspection API
// ---------------------------------------------------------------------------

describe("migrated v0 artifacts + inspection", () => {
  it("migrated v0 evaluated works with inspectTraceTarget", () => {
    const parsed = parseFrozenArtifact(loadFixture("v0-evaluated.json"));

    const tree = inspectTraceTarget(model, parsed.trace, equityRatio.id);
    const ascii = inspectionNodeToAscii(tree, { showMeta: true, showChange: true });

    expect(ascii).toMatchInlineSnapshot(`
      "└── Eigenkapitalquote [ratio] = 0.9090909090909091
          ├── Eigenkapital [input] = 100
          └── Bilanzsumme [sum] = 110
              ├── Eigenkapital [input] = 100
              └── Fremdkapital [input] = 10"
    `);
  });

  it("migrated v0 without trace degrades gracefully", () => {
    const v0 = loadFixture("v0-evaluated.json");
    delete v0.trace;

    const parsed = parseFrozenArtifact(v0);

    // With empty trace, inspectTraceTarget produces a bare input node
    const tree = inspectTraceTarget(model, parsed.trace, equityRatio.id);
    expect(tree.kind).toBe("input");
    expect(tree.children).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Round-trip: freeze → JSON.stringify → JSON.parse → parse → inspect
// ---------------------------------------------------------------------------

describe("round-trip: freeze → serialize → parse → inspect", () => {
  it("FrozenEvaluatedDraft round-trip produces identical ASCII to live path", () => {
    const evaluated = evaluateDraft(model, draft, "lenient");
    const frozen = freezeEvaluatedDraft(model, evaluated);

    const json = JSON.parse(JSON.stringify(frozen));
    const parsed = parseFrozenArtifact(json);

    const liveTree = inspectTraceTarget(model, evaluated.result.trace, equityRatio.id);
    const roundTripTree = inspectTraceTarget(model, parsed.trace, equityRatio.id);

    const opts = { showMeta: true, showChange: true } as const;
    expect(inspectionNodeToAscii(roundTripTree, opts)).toBe(inspectionNodeToAscii(liveTree, opts));
  });
});
