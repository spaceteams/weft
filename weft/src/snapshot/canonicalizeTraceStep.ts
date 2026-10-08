import type { TraceStep } from "../evaluate/trace-step";
import type { KeyId } from "../key";
import type { KeyMeta } from "../key-meta";
import type { CompiledModel } from "../model";

import { type CanonicalJson, canonicalize } from "./canonicalize";
import { canonicalizeValue } from "./canonicalizeValue";

export type CanonicalTraceStep = {
  readonly target: KeyId;
  readonly keyMeta?: KeyMeta;
  readonly deps: readonly KeyId[];

  readonly ruleSpec: Record<string, CanonicalJson>;
  readonly inputs: Record<KeyId, CanonicalJson>;
  readonly output: CanonicalJson;
  readonly detail: Record<string, CanonicalJson>;

  /** Per-layer dependency values used by this step, keyed by layer name then dep key. */
  readonly layerInputs?: Readonly<Record<string, Record<KeyId, CanonicalJson>>>;
  /** Per-layer computed output for this step's target, keyed by layer name. */
  readonly layerOutputs?: Readonly<Record<string, CanonicalJson>>;
};

export function canonicalizeTraceStep(model: CompiledModel, step: TraceStep): CanonicalTraceStep {
  const at = (field: string) => `trace.${step.target}.${field}`;

  const inputs: Record<KeyId, CanonicalJson> = {};
  for (const [depKey, value] of Object.entries(step.inputs)) {
    inputs[depKey] = canonicalizeValue(model, depKey, value, at(`inputs.${depKey}`));
  }

  const detail: Record<string, CanonicalJson> = {};
  for (const [key, value] of Object.entries(step.detail)) {
    detail[key] = canonicalize(value, at(`detail.${key}`));
  }

  const ruleSpec: Record<string, CanonicalJson> = {};
  for (const [key, value] of Object.entries(step.ruleSpec)) {
    ruleSpec[key] = canonicalize(value, at(`ruleSpec.${key}`));
  }

  return {
    target: step.target,
    keyMeta: step.keyMeta,
    deps: step.deps,

    ruleSpec,
    inputs,
    output: canonicalizeValue(model, step.target, step.output, at("output")),
    detail,
    ...(step.layerInputs && {
      layerInputs: canonicalizeTraceLayerInputs(model, step.layerInputs, at("layerInputs")),
    }),
    ...(step.layerOutputs && {
      layerOutputs: canonicalizeTraceLayerOutputs(model, step.layerOutputs, at("layerOutputs")),
    }),
  };
}

function canonicalizeTraceLayerInputs(
  model: CompiledModel,
  layerInputs: Readonly<Record<string, Record<KeyId, unknown>>>,
  pathPrefix?: string,
): Record<string, Record<KeyId, CanonicalJson>> {
  const result: Record<string, Record<KeyId, CanonicalJson>> = {};
  for (const [layerName, deps] of Object.entries(layerInputs)) {
    const evaluator = model.layers.find((l) => l.name === layerName);
    const canonicalDeps: Record<KeyId, CanonicalJson> = {};
    for (const [k, v] of Object.entries(deps)) {
      canonicalDeps[k] = evaluator?.codec
        ? evaluator.codec.encode(v)
        : canonicalize(v, join(pathPrefix, layerName, k));
    }
    result[layerName] = canonicalDeps;
  }
  return result;
}

function canonicalizeTraceLayerOutputs(
  model: CompiledModel,
  layerOutputs: Readonly<Record<string, unknown>>,
  pathPrefix?: string,
): Record<string, CanonicalJson> {
  const result: Record<string, CanonicalJson> = {};
  for (const [layerName, value] of Object.entries(layerOutputs)) {
    const evaluator = model.layers.find((l) => l.name === layerName);
    result[layerName] = evaluator?.codec
      ? evaluator.codec.encode(value)
      : canonicalize(value, join(pathPrefix, layerName));
  }
  return result;
}

function join(prefix: string | undefined, ...segments: string[]): string | undefined {
  return prefix === undefined ? segments.join(".") : [prefix, ...segments].join(".");
}
