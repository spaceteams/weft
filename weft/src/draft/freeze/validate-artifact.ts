import { canonicalize } from "../../snapshot/canonicalize";
import { CURRENT_FROZEN_VERSION } from "./version";

/**
 * Structural validation for frozen evaluated drafts.
 *
 * `migrateFrozenArtifact` only inspects the `version` field, so an artifact that
 * claims the current version but is otherwise malformed migrates "successfully".
 * The caller then receives it typed as a `FrozenEvaluatedDraft`, and the missing
 * or wrongly-typed field surfaces far from its cause — potentially in client code
 * that only ever touched a well-formed artifact before.
 *
 * This module closes that gap. It checks the shape of the artifact envelope and
 * confirms every value is canonical JSON (which also rejects `undefined`, `Set`,
 * `Map`, `RegExp`, and circular references). It deliberately does **not** validate
 * values against JSON Schemas — that is {@link validateFrozenDraft}'s job, and it
 * needs a consumer-supplied validator.
 */

const DELTA_KINDS = ["added", "removed", "changed"] as const;

const FINGERPRINT_FIELDS = [
  "modelFingerprint",
  "baseFingerprint",
  "overlayFingerprint",
  "analysisFingerprint",
] as const;

/**
 * Check a migrated frozen artifact for structural integrity.
 *
 * @param artifact - An artifact that has already been through
 *   {@link migrateFrozenArtifact}.
 * @returns Every problem found, each phrased as a path plus the reason. Empty
 *   when the artifact is well formed. All problems are collected rather than
 *   failing on the first, so one round trip surfaces everything.
 */
export function validateFrozenArtifact(artifact: Record<string, unknown>): string[] {
  const problems: string[] = [];

  if (artifact.version !== CURRENT_FROZEN_VERSION) {
    problems.push(`version: expected ${CURRENT_FROZEN_VERSION}, got ${describe(artifact.version)}`);
  }
  requireString(problems, "draftId", artifact.draftId);
  requireString(problems, "frozenAt", artifact.frozenAt);
  checkSnapshot(problems, artifact.snapshot);

  for (const field of ["base", "overlay", "effective", "values"] as const) {
    requireObject(problems, field, artifact[field]);
  }

  checkDeltas(problems, artifact.deltas);
  checkTrace(problems, artifact.trace);

  if (artifact.layers !== undefined) {
    checkLayers(problems, artifact.layers);
  }

  // Canonicalizability. Anything a frozen artifact legitimately contains is
  // already CanonicalJson, so this rejects undefined/Set/Map/RegExp/circular and
  // reports the offending path via canonicalize's own error message.
  try {
    canonicalize(artifact);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }

  return problems;
}

/**
 * Format {@link validateFrozenArtifact}'s output as a single throwable message.
 */
export function frozenArtifactErrorMessage(problems: readonly string[]): string {
  return `Frozen artifact is malformed:\n${problems.map((p) => `- ${p}`).join("\n")}`;
}

// ---------------------------------------------------------------------------
// Field checks
// ---------------------------------------------------------------------------

function checkSnapshot(problems: string[], snapshot: unknown): void {
  if (!isPlainObject(snapshot)) {
    problems.push(`snapshot: expected an object, got ${describe(snapshot)}`);
    return;
  }
  for (const field of FINGERPRINT_FIELDS) {
    if (typeof snapshot[field] !== "string") {
      problems.push(`snapshot.${field}: expected a string, got ${describe(snapshot[field])}`);
    }
  }
  // A migrated artifact legitimately carries an older value here — that is how a
  // consumer tells its fingerprints are not comparable with the current ones —
  // so this checks the type, not equality with CURRENT_FINGERPRINT_VERSION.
  if (typeof snapshot.fingerprintVersion !== "number") {
    problems.push(
      `snapshot.fingerprintVersion: expected a number, got ${describe(snapshot.fingerprintVersion)}`,
    );
  }
  if (typeof snapshot.createdAt !== "string") {
    problems.push(`snapshot.createdAt: expected a string, got ${describe(snapshot.createdAt)}`);
  }
}

function checkDeltas(problems: string[], deltas: unknown): void {
  if (!Array.isArray(deltas)) {
    problems.push(`deltas: expected an array, got ${describe(deltas)}`);
    return;
  }
  deltas.forEach((delta, index) => {
    const at = `deltas[${index}]`;
    if (!isPlainObject(delta)) {
      problems.push(`${at}: expected an object, got ${describe(delta)}`);
      return;
    }
    if (typeof delta.key !== "string") {
      problems.push(`${at}.key: expected a string, got ${describe(delta.key)}`);
    }
    if (typeof delta.kind !== "string" || !DELTA_KINDS.includes(delta.kind as never)) {
      problems.push(
        `${at}.kind: expected one of ${DELTA_KINDS.join(" | ")}, got ${describe(delta.kind)}`,
      );
    }
  });
}

function checkTrace(problems: string[], trace: unknown): void {
  if (!Array.isArray(trace)) {
    problems.push(`trace: expected an array, got ${describe(trace)}`);
    return;
  }
  trace.forEach((step, index) => {
    const at = `trace[${index}]`;
    if (!isPlainObject(step)) {
      problems.push(`${at}: expected an object, got ${describe(step)}`);
      return;
    }
    if (typeof step.target !== "string") {
      problems.push(`${at}.target: expected a string, got ${describe(step.target)}`);
    }
    if (!Array.isArray(step.deps)) {
      problems.push(`${at}.deps: expected an array, got ${describe(step.deps)}`);
    }
    for (const field of ["ruleSpec", "inputs", "detail"] as const) {
      if (!isPlainObject(step[field])) {
        problems.push(`${at}.${field}: expected an object, got ${describe(step[field])}`);
      }
    }
    // `output` may legitimately be null, so only its presence is required.
    if (!("output" in step)) {
      problems.push(`${at}.output: missing`);
    }
  });
}

function checkLayers(problems: string[], layers: unknown): void {
  if (!isPlainObject(layers)) {
    problems.push(`layers: expected an object, got ${describe(layers)}`);
    return;
  }
  for (const [layerName, values] of Object.entries(layers)) {
    if (!isPlainObject(values)) {
      problems.push(`layers.${layerName}: expected an object, got ${describe(values)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireString(problems: string[], field: string, value: unknown): void {
  if (typeof value !== "string") {
    problems.push(`${field}: expected a string, got ${describe(value)}`);
  }
}

function requireObject(problems: string[], field: string, value: unknown): void {
  if (!isPlainObject(value)) {
    problems.push(`${field}: expected an object, got ${describe(value)}`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describe(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  if (typeof value === "object") return "an object";
  return `a ${typeof value}`;
}
