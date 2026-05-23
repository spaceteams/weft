import type { AnyKey, Key, KeyId } from "../key";
import { type Resolver, type Rule, rule } from ".";

export type MapEntriesSpec = {
  op: "mapEntries";
  source: KeyId;
  extraDeps: readonly KeyId[];
};

export function mapEntries<V, R>(
  target: Key<Record<string, R>>,
  source: Key<Record<string, V>>,
  transform: (value: V, get: Resolver) => R,
  extraDeps?: readonly AnyKey[],
): Rule<Record<string, R>> {
  const extra = extraDeps ?? [];
  const spec: MapEntriesSpec = {
    op: "mapEntries",
    source: source.id,
    extraDeps: extra.map((d) => d.id),
  };
  const deps: AnyKey[] = [source, ...extra];
  return rule({
    target,
    spec,
    deps,
    eval: (get) => {
      const input = get(source);
      const output = {} as Record<string, R>;
      for (const [k, v] of Object.entries(input)) {
        output[k] = transform(v as V, get);
      }
      return { output };
    },
  });
}
