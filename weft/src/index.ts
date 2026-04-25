/**
 * @spaceteams/weft — A typed computation model with overlay-based what-if analysis.
 *
 * ## API Tiers
 *
 * The API is organized into layers from foundational to high-level.
 * You can import everything from the main entry point for convenience,
 * or from a specific subpath for clarity about which layer you're using:
 *
 * | Subpath              | Description                                |
 * |----------------------|--------------------------------------------|
 * | `@spaceteams/weft/core`      | Keys, values, inputs, facts, semantics     |
 * | `@spaceteams/weft/rules`     | Rule definitions and factories             |
 * | `@spaceteams/weft/model`     | Model building, compilation, and graphs    |
 * | `@spaceteams/weft/evaluate`  | Pure evaluation engine                     |
 * | `@spaceteams/weft/overlay`   | Overlay evaluation and diffing             |
 * | `@spaceteams/weft/draft`     | Draft lifecycle and analysis               |
 * | `@spaceteams/weft/inspect`   | Inspection trees and ASCII rendering       |
 * | `@spaceteams/weft/snapshot`  | Canonical serialization and fingerprinting |
 */

// ── Core: primitives and semantics ──────────────────────────────────────────

export * from "./facts";
export * from "./input";
export * from "./key";
export * from "./key-meta";
export * from "./semantics/algebra";
export * from "./semantics/codec";
export * from "./semantics/formatter";
export * from "./value";

// ── Rules: computation specifications ───────────────────────────────────────

export * from "./rule";
export * from "./rule/decision";
export * from "./rule/operand";
export * from "./rule/projection";
export * from "./rule/ratio";
export * from "./rule/rule-meta";
export * from "./rule/scale";
export * from "./rule/sum";
export * from "./rule/weighted-sum";

// ── Model: assembly, compilation, and graph analysis ────────────────────────

export * from "./model";
export * from "./model/compile-model";
export * from "./model/create-model";
export * from "./model/model";
export * from "./model/model-graph";

// ── Evaluate: pure evaluation engine ────────────────────────────────────────

export * from "./evaluate";
export * from "./evaluate/evaluation-result";

// ── Overlay: what-if evaluation and diffing ─────────────────────────────────

export * from "./overlay";
export * from "./overlay/diff-group";
export * from "./overlay/diff-results";
export * from "./overlay/evaluate-overlay";
export * from "./overlay/explain-diff";

// ── Draft: lifecycle, analysis, and serialization ───────────────────────────

export * from "./draft";

// ── Inspect: visualization and debugging ────────────────────────────────────

export * from "./inspect/inspect-diff-target";
export * from "./inspect/inspect-model-target";
export * from "./inspect/inspect-trace-target";
export * from "./inspect/inspection-node";
export * from "./inspect/inspection-node-to-ascii";

// ── Snapshot: canonical serialization and fingerprinting ────────────────────

export * from "./snapshot/canonicalize";
export * from "./snapshot/canonicalizeDelta";
export * from "./snapshot/canonicalizeFacts";
export * from "./snapshot/canonicalizeTraceStep";
export * from "./snapshot/canonicalizeValue";
export * from "./snapshot/fingerprint";
