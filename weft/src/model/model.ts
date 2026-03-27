import type { AnyKey, KeyId } from "../key";
import type { CompiledModel } from ".";

export function getDependencies(model: CompiledModel, key: AnyKey): readonly KeyId[] {
  return model.depsByTarget.get(key.id) ?? [];
}

export function getDependents(model: CompiledModel, key: AnyKey): readonly KeyId[] {
  return model.dependentsByKey.get(key.id) ?? [];
}

export function getDeclaredKeys(model: CompiledModel): readonly KeyId[] {
  return [...model.inputKeys, ...model.orderedRuleTargets];
}

export function upstreamOf(model: CompiledModel, key: AnyKey): readonly KeyId[] {
  const visited = new Set<KeyId>();
  const stack = [...(model.depsByTarget.get(key.id) ?? [])];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const deps = model.depsByTarget.get(current);
    if (deps) {
      for (const dep of deps) {
        if (!visited.has(dep)) stack.push(dep);
      }
    }
  }

  return sortKeysByModelOrder(model, visited);
}

export function downstreamOf(model: CompiledModel, key: AnyKey): readonly KeyId[] {
  const visited = new Set<KeyId>();
  const stack = [...(model.dependentsByKey.get(key.id) ?? [])];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const dependents = model.dependentsByKey.get(current);
    if (dependents) {
      for (const dependent of dependents) {
        if (!visited.has(dependent)) stack.push(dependent);
      }
    }
  }

  return sortKeysByModelOrder(model, visited);
}

export function sortKeysByModelOrder(
  model: CompiledModel,
  keys: Iterable<KeyId>,
): readonly string[] {
  const keySet = new Set(keys);
  const ordered = [
    ...model.inputKeys.filter((k) => keySet.has(k)),
    ...model.orderedRuleTargets.filter((k) => keySet.has(k)),
  ];
  return ordered;
}
