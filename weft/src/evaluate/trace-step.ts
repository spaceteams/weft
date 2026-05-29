import type { KeyId } from "../key";
import type { KeyMeta } from "../key-meta";

export type TraceStep = {
  readonly target: KeyId;
  readonly keyMeta?: KeyMeta;
  readonly deps: readonly KeyId[];

  readonly ruleSpec: Record<string, unknown>;
  readonly inputs: Record<KeyId, unknown>;
  readonly output: unknown;
  readonly detail: Record<string, unknown>;

  /** Per-layer dependency values used by this step, keyed by layer name then dep key. */
  readonly layerInputs?: Readonly<Record<string, Record<KeyId, unknown>>>;
  /** Per-layer computed output for this step's target, keyed by layer name. */
  readonly layerOutputs?: Readonly<Record<string, unknown>>;
};
