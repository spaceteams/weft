import type { AnyKey, KeyId } from "../key";
import type { Rule } from "../rule";
import type { CompiledModel, Model } from ".";

export type ModelIssue = {
  level: "error" | "warn";
  code:
    | "DUPLICATE_INPUT"
    | "DUPLICATE_RULE_TARGET"
    | "INPUT_RULE_CONFLICT"
    | "MISSING_DEPENDENCY"
    | "CYCLE";
  message: string;
  keys?: readonly KeyId[];
};
export type CompileResult =
  | { ok: true; model: CompiledModel; issues: readonly ModelIssue[] }
  | { ok: false; issues: readonly ModelIssue[] };
export function compileModel(model: Model): CompileResult {
  const issues: ModelIssue[] = [];

  const inputKeys = new Set<string>();
  for (const input of model.inputs) {
    const id = input.key.id;
    if (inputKeys.has(id)) {
      issues.push({
        level: "error",
        code: "DUPLICATE_INPUT",
        message: `Input "${id}" is declared more than once.`,
        keys: [id],
      });
    }
    inputKeys.add(id);
  }

  const ruleByTarget = new Map<string, Rule<unknown>>();
  for (const rule of model.rules) {
    const targetId = rule.target.id;
    if (ruleByTarget.has(targetId)) {
      issues.push({
        level: "error",
        code: "DUPLICATE_RULE_TARGET",
        message: `Rule target "${targetId}" is declared more than once.`,
        keys: [targetId],
      });
      continue;
    }
    ruleByTarget.set(targetId, rule);
  }

  for (const inputId of inputKeys) {
    if (ruleByTarget.has(inputId)) {
      issues.push({
        level: "error",
        code: "INPUT_RULE_CONFLICT",
        message: `Key "${inputId}" is declared as both input and rule target.`,
        keys: [inputId],
      });
    }
  }

  const knownKeys = new Set<string>([...inputKeys, ...ruleByTarget.keys()]);

  const depsByTarget = new Map<string, readonly string[]>();
  const dependentsByKeyMutable = new Map<string, string[]>();

  for (const rule of model.rules) {
    const targetId = rule.target.id;
    const depIds = rule.deps.map((dep) => dep.id);
    depsByTarget.set(targetId, depIds);

    for (const depId of depIds) {
      if (!knownKeys.has(depId)) {
        issues.push({
          level: "error",
          code: "MISSING_DEPENDENCY",
          message: `Rule "${targetId}" depends on unkown key "${depId}".`,
          keys: [targetId, depId],
        });
        continue;
      }

      const dependents = dependentsByKeyMutable.get(depId);
      if (dependents) {
        dependents.push(targetId);
      } else {
        dependentsByKeyMutable.set(depId, [targetId]);
      }
    }
  }

  const hasErrors = issues.some((issue) => issue.level === "error");
  if (hasErrors) {
    return { ok: false, issues };
  }

  const inDegree = new Map<string, number>();
  for (const targetId of ruleByTarget.keys()) {
    inDegree.set(targetId, 0);
  }
  for (const [targetId, depIds] of depsByTarget) {
    let count = 0;
    for (const depId of depIds) {
      if (ruleByTarget.has(depId)) {
        count += 1;
      }
    }
    inDegree.set(targetId, count);
  }

  const queue: string[] = [];
  for (const [targetId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(targetId);
    }
  }

  const orderedRuleTargets: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    orderedRuleTargets.push(current);

    const dependents = dependentsByKeyMutable.get(current) ?? [];
    for (const dependentTarget of dependents) {
      if (!inDegree.has(dependentTarget)) {
        continue;
      }

      const nextDegree = inDegree.get(dependentTarget)! - 1;
      inDegree.set(dependentTarget, nextDegree);

      if (nextDegree === 0) {
        queue.push(dependentTarget);
      }
    }
  }

  if (orderedRuleTargets.length !== ruleByTarget.size) {
    const unresolved = [...ruleByTarget.keys()].filter(
      (targetId) => !orderedRuleTargets.includes(targetId),
    );
    issues.push({
      level: "error",
      code: "CYCLE",
      message: `Cycle detected among rule targets "${unresolved.join(", ")}"`,
      keys: unresolved,
    });
    return { ok: false, issues };
  }

  const dependentsByKey = new Map<string, readonly KeyId[]>(
    [...dependentsByKeyMutable.entries()].map(([k, v]) => [k, [...v]]),
  );

  const declaredKeys = [
    ...model.inputs.map((i): [KeyId, AnyKey] => [i.key.id, i.key]),
    ...model.rules.map((r): [KeyId, AnyKey] => [r.target.id, r.target]),
  ];

  return {
    ok: true,
    issues,
    model: {
      keys: new Map(declaredKeys),
      semantics: model.semantics,
      inputs: model.inputs,
      rules: model.rules,
      keyMeta: model.keyMeta,
      ruleMeta: model.ruleMeta,
      inputKeys: [...inputKeys],
      orderedRuleTargets,
      ruleByTarget,
      depsByTarget,
      dependentsByKey,
    },
  };
}
