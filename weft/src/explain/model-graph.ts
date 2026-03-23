import type { Key, KeyId } from "../key";
import type { CompiledModel } from "../model";
import { downstreamOf, upstreamOf } from "./model";

export type ModelGraph = {
  readonly nodes: readonly KeyId[];
  readonly edges: readonly { from: KeyId; to: KeyId }[];
};

export function toGraph(model: CompiledModel): ModelGraph {
  return {
    nodes: [...model.inputKeys, ...model.orderedRuleTargets],
    edges: model.orderedRuleTargets.flatMap((to) =>
      (model.depsByTarget.get(to) ?? []).map((from) => ({ from, to })),
    ),
  };
}

export function subgraph(model: CompiledModel, includedKeys: readonly KeyId[]): ModelGraph {
  const included = new Set(includedKeys);

  const nodes = [
    ...model.inputKeys.filter((k) => included.has(k)),
    ...model.orderedRuleTargets.filter((k) => included.has(k)),
  ];

  const edges: { from: KeyId; to: KeyId }[] = [];

  for (const target of model.orderedRuleTargets) {
    if (!included.has(target)) continue;
    const deps = model.depsByTarget.get(target) ?? [];
    for (const dep of deps) {
      if (included.has(dep)) {
        edges.push({ from: dep, to: target });
      }
    }
  }

  return { nodes, edges };
}
export function upstreamGraphOf(
  model: CompiledModel,
  key: Key<unknown>,
  options?: { includeTarget?: boolean },
): ModelGraph {
  const keys = new Set(upstreamOf(model, key));
  if (options?.includeTarget ?? true) {
    keys.add(key.id);
  }
  return subgraph(model, [...keys]);
}
export function downstreamGraphOf(
  model: CompiledModel,
  key: Key<unknown>,
  options?: { includeTarget?: boolean },
): ModelGraph {
  const keys = new Set(downstreamOf(model, key));
  if (options?.includeTarget ?? true) {
    keys.add(key.id);
  }
  return subgraph(model, [...keys]);
}
