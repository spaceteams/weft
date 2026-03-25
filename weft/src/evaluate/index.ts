import type { FactBag } from "../facts";
import type { Key, KeyId } from "../key";
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
    const missingDeps: Key<unknown>[] = [];
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
    const ruleMeta = model.ruleMeta.get(target);
    const keyMeta = model.keyMeta.get(target);
    trace.push({
      target,
      deps,
      ruleKind: rule.kind,
      ruleMeta: ruleMeta,
      keyMeta: keyMeta,
      detail,
      inputs,
      output,
    });
  }

  return { values, missing, order: model.orderedRuleTargets, trace };
}
