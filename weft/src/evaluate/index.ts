export * from "./evaluation-result";
export * from "./trace-step";

import type { FactBag } from "../facts";
import type { AnyKey, Key, KeyId } from "../key";
import type { LayerEvaluator } from "../layer";
import type { CompiledModel } from "../model";
import type { Resolver } from "../rule";
import type { EvaluationResult, MissingReason } from "./evaluation-result";
import type { TraceStep } from "./trace-step";

export type EvaluateMode = "strict" | "lenient";
export const defaultEvaluateMode: EvaluateMode = "strict";

export function evaluate(
  model: CompiledModel,
  provided: FactBag,
  mode: EvaluateMode = defaultEvaluateMode,
): EvaluationResult {
  const values = new Map<KeyId, unknown>();
  const missing = new Map<KeyId, MissingReason>();
  const trace: TraceStep[] = [];

  // Initialize layer value maps, seeding with input annotations
  const layers = new Map<string, Map<KeyId, unknown>>();
  for (const evaluator of model.layers) {
    const layerMap = new Map<KeyId, unknown>();
    const inputAnnotations = model.layerInputs.get(evaluator.name);
    if (inputAnnotations) {
      for (const [keyId, value] of inputAnnotations) {
        layerMap.set(keyId, value);
      }
    }
    layers.set(evaluator.name, layerMap);
  }

  for (const input of model.inputs) {
    if (!(input.key.id in provided)) {
      if (mode === "strict") {
        throw new Error(`Missing input: ${input.key.id}`);
      } else {
        missing.set(input.key.id, { kind: "missing-input", key: input.key.id });
        continue;
      }
    }
    values.set(input.key.id, provided[input.key.id]);
  }

  for (const target of model.orderedRuleTargets) {
    const rule = model.ruleByTarget.get(target);
    if (!rule) {
      throw new Error(`Missing compiled rule: ${target}`);
    }

    const inputs: Record<string, unknown> = {};
    const missingDeps: AnyKey[] = [];
    for (const dep of rule.deps) {
      if (!values.has(dep.id)) {
        if (mode === "strict") {
          throw new Error(`Missing value: ${dep.id}`);
        } else {
          missingDeps.push(dep);
          continue;
        }
      }
      inputs[dep.id] = values.get(dep.id);
    }

    if (missingDeps.length > 0) {
      missing.set(target, {
        kind: "rule-not-run",
        key: target,
        because: missingDeps.map((d) => d.id),
      });
      continue;
    }

    const get: Resolver = <T>(key: Key<T>) => {
      if (!values.has(key.id)) {
        throw new Error(`Invariant violation: missing dependency reached rule eval: ${key.id}`);
      }
      return values.get(key.id) as T;
    };

    const { output, detail } = rule.eval(get);
    values.set(target, output);

    const deps = model.depsByTarget.get(target) ?? [];

    const keyMeta = model.keyMeta.get(target);

    // Evaluate registered layers for this rule target
    let layerInputsForTrace: Record<string, Record<KeyId, unknown>> | undefined;
    let layerOutputsForTrace: Record<string, unknown> | undefined;

    for (const evaluator of model.layers) {
      const layerMap = layers.get(evaluator.name)!;
      const depLayerValues = new Map<KeyId, unknown>();
      for (const dep of rule.deps) {
        const v = layerMap.get(dep.id);
        if (v !== undefined) depLayerValues.set(dep.id, v);
      }

      // Capture layer inputs for trace
      if (depLayerValues.size > 0) {
        const depRecord: Record<KeyId, unknown> = {};
        for (const [k, v] of depLayerValues) {
          depRecord[k] = v;
        }
        layerInputsForTrace ??= {};
        layerInputsForTrace[evaluator.name] = depRecord;
      }

      const op = (rule.spec.op ?? rule.spec.type) as string | undefined;
      let result: unknown;
      if (op) {
        result = (evaluator as LayerEvaluator<unknown>).eval(op, depLayerValues, rule.spec);
      }
      if (result === undefined && evaluator.default) {
        result = evaluator.default(depLayerValues);
      }
      if (result !== undefined) {
        layerMap.set(target, result);
        layerOutputsForTrace ??= {};
        layerOutputsForTrace[evaluator.name] = result;
      }
    }

    trace.push({
      target,
      deps,
      ruleSpec: rule.spec,
      keyMeta: keyMeta,
      detail: detail ?? {},
      inputs,
      output,
      ...(layerInputsForTrace && { layerInputs: layerInputsForTrace }),
      ...(layerOutputsForTrace && { layerOutputs: layerOutputsForTrace }),
    });
  }

  return { values, missing, order: model.orderedRuleTargets, trace, layers };
}
