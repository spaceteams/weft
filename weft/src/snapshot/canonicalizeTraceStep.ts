import type { TraceStep } from "../evaluate/trace-step";
import type { KeyId } from "../key";
import type { KeyMeta } from "../key-meta";
import type { CompiledModel } from "../model";
import type { RuleMeta } from "../rule/rule-meta";
import { type CanonicalJson, canonicalize } from "./canonicalize";
import { canonicalizeValue } from "./canonicalizeValue";

export type CanonicalTraceStep = {
  readonly target: KeyId;
  readonly keyMeta?: KeyMeta;
  readonly deps: readonly KeyId[];
  readonly ruleMeta?: RuleMeta;
  readonly ruleSpec: Record<string, CanonicalJson>;
  readonly inputs: Record<KeyId, CanonicalJson>;
  readonly output: CanonicalJson;
  readonly detail: Record<string, CanonicalJson>;
};

export function canonicalizeTraceStep(model: CompiledModel, step: TraceStep): CanonicalTraceStep {
  const inputs: Record<KeyId, CanonicalJson> = {};
  for (const [depKey, value] of Object.entries(step.inputs)) {
    inputs[depKey] = canonicalizeValue(model, depKey, value);
  }

  const detail: Record<string, CanonicalJson> = {};
  for (const [key, value] of Object.entries(step.detail)) {
    detail[key] = canonicalize(value);
  }

  const ruleSpec: Record<string, CanonicalJson> = {};
  for (const [key, value] of Object.entries(step.ruleSpec)) {
    ruleSpec[key] = canonicalize(value);
  }

  return {
    target: step.target,
    keyMeta: step.keyMeta,
    deps: step.deps,
    ruleMeta: step.ruleMeta,
    ruleSpec,
    inputs,
    output: canonicalizeValue(model, step.target, step.output),
    detail,
  };
}
