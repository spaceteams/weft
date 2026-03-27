import type { KeyId } from "../key";
import type { CompiledModel } from "../model";
import type { InspectionNode } from "./inspection-node";

export function inspectModelTarget(model: CompiledModel, target: string): InspectionNode {
  function build(key: KeyId): InspectionNode {
    const rule = model.ruleByTarget.get(key);
    const keyMeta = model.keyMeta.get(key);
    const ruleMeta = model.ruleMeta.get(key);
    return {
      key,
      kind: rule ? ((rule?.spec?.op as string) ?? "rule") : "input",
      meta: {
        key: keyMeta,
        rule: ruleMeta,
      },
      structure: {
        ruleSpec: rule?.spec,
      },
      label: keyMeta?.label ?? key,
      children: rule?.deps.map((dep) => build(dep.id)) ?? [],
    };
  }

  return build(target);
}
