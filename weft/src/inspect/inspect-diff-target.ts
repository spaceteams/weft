import type { TraceStep } from "../evaluate/trace-step";
import type { KeyId } from "../key";
import type { CompiledModel } from "../model";
import type { OverlayEvaluationResult } from "../overlay/evaluate-overlay";
import type { Change } from "../overlay/explain-diff";
import type { InspectionNode } from "./inspection-node";

export function inspectDiffTarget(
  model: CompiledModel,
  result: OverlayEvaluationResult,
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
        rule: step?.ruleMeta,
      },
      structure: {
        ruleSpec: step?.ruleSpec,
      },
      execution: {
        value: step?.output,
        trace: step,
      },
      change,
      label: step?.keyMeta?.label ?? key,
      children: step?.deps.map((dep) => build(dep, step)) ?? [],
    };
  }
  return build(target);
}
