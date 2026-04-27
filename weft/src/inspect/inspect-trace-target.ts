import type { TraceStep } from "../evaluate/trace-step";
import type { KeyId } from "../key";
import type { ModelStructure } from "../model/model-structure";
import type { InspectionNode } from "./inspection-node";

/**
 * Build an {@link InspectionNode} tree from evaluation trace data.
 *
 * The `model` parameter accepts any {@link ModelStructure} — works with both
 * live {@link CompiledModel} and hydrated frozen models.
 */
export function inspectTraceTarget(
  model: ModelStructure,
  trace: readonly TraceStep[],
  target: KeyId,
): InspectionNode {
  const stepByTarget = new Map(trace.map((s) => [s.target, s]));
  function build(key: KeyId, parentStep?: TraceStep): InspectionNode {
    const step = stepByTarget.get(key);
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
        },
        label: keyMeta?.label ?? key,
        children: [],
      };
    }

    return {
      key,
      kind: (step?.ruleSpec?.op as string) ?? "rule",
      meta: {
        key: step?.keyMeta,
        rule: step?.ruleMeta,
      },
      structure: {
        ruleSpec: step?.ruleSpec,
      },
      execution: {
        value: step?.output,
        trace: step,
      },
      label: step?.keyMeta?.label ?? key,
      children: step?.deps.map((dep) => build(dep, step)) ?? [],
    };
  }
  return build(target);
}
