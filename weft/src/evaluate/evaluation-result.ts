import type { KeyId } from "../key";
import type { TraceStep } from "./trace-step";

export type MissingReason =
  | { kind: "missing-input"; key: KeyId }
  | { kind: "rule-not-run"; key: KeyId; because: KeyId[] };

export type EvaluationResult = {
  readonly values: ReadonlyMap<KeyId, unknown>;
  readonly missing: ReadonlyMap<KeyId, MissingReason>;
  readonly order: readonly string[];
  readonly trace: readonly TraceStep[];
};
