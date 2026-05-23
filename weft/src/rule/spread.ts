import type { AnyKey, Key, KeyId } from "../key";
import { type Rule, rule } from ".";

export type SpreadSpec = {
  op: "spread";
  sources: readonly KeyId[];
};

export function spread<T extends Record<string, unknown>>(
  target: Key<T>,
  sources: readonly Key<Partial<T>>[],
): Rule<T> {
  const spec: SpreadSpec = {
    op: "spread",
    sources: sources.map((s) => s.id),
  };
  const deps: AnyKey[] = [...sources];
  return rule({
    target,
    spec,
    deps,
    eval: (get) => {
      const output = {} as Record<string, unknown>;
      for (const source of sources) {
        Object.assign(output, get(source));
      }
      return { output: output as T };
    },
  });
}
