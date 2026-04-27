import type { KeyId } from "../key";
import type { ModelStructure } from "../model/model-structure";
import type { InspectionNode } from "./inspection-node";

/**
 * Build an {@link InspectionNode} tree showing the static dependency structure
 * of a model target.
 *
 * The `model` parameter accepts any {@link ModelStructure} — works with both
 * live {@link CompiledModel} and hydrated frozen models. When `ruleSpecs` is
 * available on the model, rule kind and spec details are included in the
 * inspection nodes.
 */
export function inspectModelTarget(model: ModelStructure, target: string): InspectionNode {
  function build(key: KeyId): InspectionNode {
    const deps = model.depsByTarget.get(key);
    const isRule = deps !== undefined;
    const spec = model.ruleSpecs?.get(key);
    const keyMeta = model.keyMeta.get(key);
    const ruleMeta = model.ruleMeta.get(key);
    return {
      key,
      kind: isRule ? ((spec?.op as string) ?? "rule") : "input",
      meta: {
        key: keyMeta,
        rule: ruleMeta,
      },
      structure: {
        ruleSpec: spec,
      },
      label: keyMeta?.label ?? key,
      children: isRule ? (deps ?? []).map((dep) => build(dep)) : [],
    };
  }

  return build(target);
}
