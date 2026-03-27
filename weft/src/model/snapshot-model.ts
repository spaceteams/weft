import type { CompiledModel } from ".";

export function snapshotModel(model: CompiledModel) {
  return {
    inputKeys: [...model.inputKeys],
    rules: model.rules.map((r) => ({
      target: r.target.id,
      spec: r.spec,
    })),
  };
}
