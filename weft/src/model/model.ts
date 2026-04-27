import type { KeyId } from "../key";
import type { ModelStructure } from "./model-structure";

export function getDependencies(model: ModelStructure, key: KeyId): readonly KeyId[] {
  return model.depsByTarget.get(key) ?? [];
}

export function getDependents(model: ModelStructure, key: KeyId): readonly KeyId[] {
  return model.dependentsByKey.get(key) ?? [];
}

export function getDeclaredKeys(model: ModelStructure): readonly KeyId[] {
  return [...model.inputKeys, ...model.orderedRuleTargets];
}

export function upstreamOf(model: ModelStructure, key: KeyId): readonly KeyId[] {
  const visited = new Set<KeyId>();
  const stack = [...(model.depsByTarget.get(key) ?? [])];

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

export function downstreamOf(model: ModelStructure, key: KeyId): readonly KeyId[] {
  const visited = new Set<KeyId>();
  const stack = [...(model.dependentsByKey.get(key) ?? [])];

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
  model: ModelStructure,
  keys: Iterable<KeyId>,
): readonly KeyId[] {
  const keySet = new Set(keys);
  const ordered = [
    ...model.inputKeys.filter((k) => keySet.has(k)),
    ...model.orderedRuleTargets.filter((k) => keySet.has(k)),
  ];
  return ordered;
}
