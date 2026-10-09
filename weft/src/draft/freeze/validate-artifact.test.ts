import { describe, expect, it } from "vitest";
import { compileModel, createModel, defaultNumberOps, key, ratio, sum } from "../../index";
import { evaluateDraft } from "../evaluate-draft";
import { freezeEvaluatedDraft } from "./freeze-evaluated-draft";
import { migrateFrozenArtifact } from "./migrate";
import { parseFrozenArtifact } from "./parse";
import { validateFrozenArtifact } from "./validate-artifact";
import { CURRENT_FROZEN_VERSION } from "./version";

// ---------------------------------------------------------------------------
// Fixture: a real frozen artifact, then deliberately corrupted copies
// ---------------------------------------------------------------------------

const equity = key<number>("equity");
const liabilities = key<number>("liabilities");
const total = key<number>("total");
const equityRatio = key<number>("equityRatio");

const m = createModel();
m.input(equity, { label: "Eigenkapital" });
m.input(liabilities, { label: "Fremdkapital" });
m.rule(sum(defaultNumberOps, total, [equity, liabilities]), { label: "Total" });
m.rule(ratio(defaultNumberOps, equityRatio, equity, total), { label: "Ratio" });

const compiled = compileModel(m.build());
if (!compiled.ok) throw new Error(compiled.issues.map((i) => i.message).join());
const model = compiled.model;

const valid = freezeEvaluatedDraft(
  model,
  evaluateDraft(
    model,
    { draftId: "d", base: { equity: 100, liabilities: 25 }, overlay: { liabilities: 10 } },
    "lenient",
  ),
);

function corrupted(mutate: (artifact: Record<string, unknown>) => void): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(valid)) as Record<string, unknown>;
  mutate(clone);
  return clone;
}

describe("validateFrozenArtifact", () => {
  it("accepts a freshly frozen artifact", () => {
    expect(validateFrozenArtifact(valid)).toEqual([]);
  });

  it("accepts an artifact after a JSON round trip", () => {
    expect(validateFrozenArtifact(JSON.parse(JSON.stringify(valid)))).toEqual([]);
  });

  it("reports a missing field", () => {
    const problems = validateFrozenArtifact(corrupted((a) => delete a.draftId));
    expect(problems).toContain("draftId: expected a string, got undefined");
  });

  it("reports a mistyped envelope field", () => {
    const problems = validateFrozenArtifact(corrupted((a) => (a.values = "nope")));
    expect(problems).toContain("values: expected an object, got a string");
  });

  it("reports every problem, not just the first", () => {
    const problems = validateFrozenArtifact(
      corrupted((a) => {
        delete a.draftId;
        a.frozenAt = 42;
        a.deltas = "not-an-array";
        a.trace = "not-an-array";
      }),
    );
    expect(problems).toContain("draftId: expected a string, got undefined");
    expect(problems).toContain("frozenAt: expected a string, got a number");
    expect(problems).toContain("deltas: expected an array, got a string");
    expect(problems).toContain("trace: expected an array, got a string");
  });

  describe("snapshot", () => {
    it("reports a missing snapshot", () => {
      const problems = validateFrozenArtifact(corrupted((a) => delete a.snapshot));
      expect(problems).toContain("snapshot: expected an object, got undefined");
    });

    it("reports a mistyped fingerprint", () => {
      const problems = validateFrozenArtifact(
        corrupted((a) => {
          const snap = a.snapshot as Record<string, unknown>;
          snap.modelFingerprint = 99;
        }),
      );
      expect(problems).toContain("snapshot.modelFingerprint: expected a string, got a number");
    });
  });

  describe("deltas", () => {
    it("reports a non-array", () => {
      const problems = validateFrozenArtifact(corrupted((a) => (a.deltas = {})));
      expect(problems).toContain("deltas: expected an array, got an object");
    });

    it("reports an unknown kind", () => {
      const problems = validateFrozenArtifact(
        corrupted((a) => (a.deltas = [{ key: "x", kind: "sideways" }])),
      );
      expect(problems[0]).toMatch(/deltas\[0\]\.kind: expected one of added \| removed \| changed/);
    });

    it("reports a missing key", () => {
      const problems = validateFrozenArtifact(
        corrupted((a) => (a.deltas = [{ kind: "added", after: 1 }])),
      );
      expect(problems[0]).toBe("deltas[0].key: expected a string, got undefined");
    });
  });

  describe("trace", () => {
    it("reports a missing target", () => {
      const problems = validateFrozenArtifact(
        corrupted((a) => {
          a.trace = [{ deps: [], ruleSpec: {}, inputs: {}, output: 1, detail: {} }];
        }),
      );
      expect(problems).toContain("trace[0].target: expected a string, got undefined");
    });

    it("reports a mistyped deps", () => {
      const problems = validateFrozenArtifact(
        corrupted((a) => {
          a.trace = [{ target: "total", deps: "x", ruleSpec: {}, inputs: {}, detail: {} }];
        }),
      );
      expect(problems).toContain("trace[0].deps: expected an array, got a string");
    });

    it("reports a missing output but accepts a null output", () => {
      expect(
        validateFrozenArtifact(
          corrupted((a) => {
            a.trace = [{ target: "t", deps: [], ruleSpec: {}, inputs: {}, detail: {} }];
          }),
        ),
      ).toContain("trace[0].output: missing");

      expect(
        validateFrozenArtifact(
          corrupted((a) => {
            a.trace = [
              { target: "t", deps: [], ruleSpec: {}, inputs: {}, output: null, detail: {} },
            ];
          }),
        ),
      ).toEqual([]);
    });

    it("reports a non-object entry", () => {
      const problems = validateFrozenArtifact(corrupted((a) => (a.trace = ["oops"])));
      expect(problems).toContain("trace[0]: expected an object, got a string");
    });
  });

  describe("layers", () => {
    it("is accepted when absent", () => {
      expect(valid.layers).toBeUndefined();
      expect(validateFrozenArtifact(corrupted((a) => delete a.layers))).toEqual([]);
    });

    it("reports a non-object layer bag", () => {
      const problems = validateFrozenArtifact(corrupted((a) => (a.layers = [])));
      expect(problems).toContain("layers: expected an object, got an array");
    });

    it("reports a non-object layer entry", () => {
      const problems = validateFrozenArtifact(corrupted((a) => (a.layers = { units: 5 })));
      expect(problems).toContain("layers.units: expected an object, got a number");
    });
  });

  describe("canonicalizability", () => {
    it("rejects undefined values and names the path", () => {
      const problems = validateFrozenArtifact(
        corrupted((a) => {
          (a.values as Record<string, unknown>).total = undefined;
        }),
      );
      expect(problems[0]).toBe(
        "Unsupported value for canonicalization: undefined (at values.total)",
      );
    });

    it("rejects an undefined nested inside a trace detail", () => {
      const problems = validateFrozenArtifact(
        corrupted((a) => {
          const trace = a.trace as Record<string, unknown>[];
          trace[0].detail = { bad: undefined };
        }),
      );
      // Validating a whole artifact uses index notation; canonicalizing a single
      // trace step during freeze uses the target key (`trace.<target>.detail.*`).
      expect(problems[0]).toContain("trace[0].detail.bad");
    });

    it("rejects a Set that silently canonicalizes to an empty object", () => {
      const problems = validateFrozenArtifact(
        corrupted((a) => {
          (a.values as Record<string, unknown>).total = new Set([1, 2]);
        }),
      );
      // canonicalize() does not reject Set (PLAN 7g), so this documents the
      // remaining gap rather than asserting it is caught.
      expect(problems).toEqual([]);
    });
  });

  it("rejects a version other than the current one", () => {
    const problems = validateFrozenArtifact({ ...valid, version: 999 });
    expect(problems[0]).toMatch(
      new RegExp(`version: expected ${CURRENT_FROZEN_VERSION}, got a number`),
    );
  });
});

describe("parseFrozenArtifact", () => {
  it("parses a well-formed artifact", () => {
    expect(parseFrozenArtifact(JSON.parse(JSON.stringify(valid))).draftId).toBe("d");
  });

  it("migrates an older artifact and validates the result", () => {
    // No `version` field is treated as v0.
    const v0 = JSON.parse(JSON.stringify(valid)) as Record<string, unknown>;
    delete v0.version;
    expect(parseFrozenArtifact(v0).draftId).toBe("d");
  });

  it("still rejects non-objects", () => {
    expect(() => parseFrozenArtifact(null)).toThrow("Frozen artifact must be a non-null object.");
    expect(() => parseFrozenArtifact([1, 2])).toThrow("Frozen artifact must be a non-null object.");
    expect(() => parseFrozenArtifact("x")).toThrow("Frozen artifact must be a non-null object.");
  });

  it("still rejects a newer version before validating", () => {
    expect(() => parseFrozenArtifact({ ...valid, version: 9999 })).toThrow(
      /newer than the current version/,
    );
  });

  it("throws on a structurally malformed artifact", () => {
    const broken = JSON.parse(JSON.stringify(valid)) as Record<string, unknown>;
    delete broken.trace;
    expect(() => parseFrozenArtifact(broken)).toThrow(
      /Frozen artifact is malformed:\n- trace: expected an array, got undefined/,
    );
  });

  it("reports every problem in one message", () => {
    const broken = JSON.parse(JSON.stringify(valid)) as Record<string, unknown>;
    delete broken.draftId;
    broken.overlay = 7;
    expect(() => parseFrozenArtifact(broken)).toThrow(
      /- draftId: expected a string, got undefined\n- overlay: expected an object, got a number/,
    );
  });
});

describe("migrateFrozenArtifact vs parseFrozenArtifact", () => {
  it("migrate alone does not validate", () => {
    // Documented escape hatch: callers wanting the raw shape without validation
    // can go through migrateFrozenArtifact directly.
    const broken = { ...valid, draftId: 12345 };
    expect(() => migrateFrozenArtifact(broken)).not.toThrow();
    expect(() => parseFrozenArtifact(broken)).toThrow(/draftId: expected a string/);
  });
});
