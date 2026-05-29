import type { TraceStep } from "../evaluate/trace-step";
import type { KeyId } from "../key";
import type { ModelStructure } from "../model/model-structure";
import type { Change } from "../overlay/explain-diff";
import type { InspectionNode } from "./inspection-node";

/**
 * Build an {@link InspectionNode} tree for a diff target, showing values,
 * changes, and the dependency structure.
 *
 * The `result` parameter only needs a `trace` — any object that carries
 * `{ trace: readonly TraceStep[] }` works, including both live
 * `OverlayEvaluationResult` and frozen artifacts like `FrozenEvaluatedDraft`.
 *
 * The `model` parameter accepts any {@link ModelStructure} — works with both
 * live {@link CompiledModel} and hydrated frozen models.
 */
export function inspectDiffTarget(
  model: ModelStructure,
  result: { trace: readonly TraceStep[] },
  changes: readonly Change[],
  target: KeyId,
): InspectionNode {
  const changeByKey = new Map(changes.map((change) => [change.delta.key, change]));
  const stepByTarget = new Map(result.trace.map((step) => [step.target, step]));

  function build(key: KeyId, parentStep?: TraceStep): InspectionNode {
    const step = stepByTarget.get(key);
    const change = changeByKey.get(key);
    if (!step) {
      const keyMeta = model.keyMeta.get(key);
      return {
        key,
        kind: "input",
        meta: {
          key: keyMeta,
        },
        execution: {
          value: parentStep?.inputs[key],
          layers: extractInputLayerValues(parentStep, key),
        },
        change,
        label: keyMeta?.label ?? key,
        children: [],
      };
    }

    return {
      key,
      kind: (step?.ruleSpec?.op as string) ?? "rule",
      meta: {
        key: step?.keyMeta,
      },
      structure: {
        ruleSpec: step?.ruleSpec,
      },
      execution: {
        value: step?.output,
        trace: step,
        layers: step?.layerOutputs ? { ...step.layerOutputs } : undefined,
      },
      change,
      label: step?.keyMeta?.label ?? key,
      children: step?.deps.map((dep) => build(dep, step)) ?? [],
    };
  }
  return build(target);
}

/**
 * Extract layer values for an input key from the parent trace step's layer inputs.
 */
function extractInputLayerValues(
  parentStep: TraceStep | undefined,
  key: KeyId,
): Record<string, unknown> | undefined {
  if (!parentStep?.layerInputs) return undefined;
  let result: Record<string, unknown> | undefined;
  for (const [layerName, layerDeps] of Object.entries(parentStep.layerInputs)) {
    if (key in layerDeps) {
      result ??= {};
      result[layerName] = layerDeps[key];
    }
  }
  return result;
}
