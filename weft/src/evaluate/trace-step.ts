import type { KeyId } from "../key";
import type { KeyMeta } from "../key-meta";
import type { RuleMeta } from "../rule/rule-meta";

export type TraceStep = {
  readonly target: KeyId;
  readonly keyMeta?: KeyMeta;
  readonly deps: readonly KeyId[];
  readonly ruleMeta?: RuleMeta;
  readonly ruleSpec: Record<string, unknown>;
  readonly inputs: Record<KeyId, unknown>;
  readonly output: unknown;
  readonly detail: Record<string, unknown>;
};
