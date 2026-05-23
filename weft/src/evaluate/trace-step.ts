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
};
