import type { TraceStep } from "../evaluate/trace-step";
import type { KeyId } from "../key";
import type { CompiledModel } from "../model";
import type { InspectionNode } from "./inspection-node";

export function inspectTraceTarget(
  model: CompiledModel,
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
