import type { KeyId } from "../key";
import type { TraceStep } from "./trace-step";

export type MissingReason =
  | { kind: "missing-input"; key: KeyId }
  | { kind: "rule-not-run"; key: KeyId; because: KeyId[] };

/** Sparse map of key id → layer value for a single layer. */
export type LayerValueMap = ReadonlyMap<KeyId, unknown>;

/** All layer results keyed by layer name. */
export type LayerResults = ReadonlyMap<string, LayerValueMap>;

export type EvaluationResult = {
  readonly values: ReadonlyMap<KeyId, unknown>;
  readonly missing: ReadonlyMap<KeyId, MissingReason>;
  readonly order: readonly string[];
  readonly trace: readonly TraceStep[];
  /** Per-layer evaluation results. Keyed by layer name, then by key id. Sparse — only keys with computed layer values appear. */
  readonly layers: LayerResults;
};
