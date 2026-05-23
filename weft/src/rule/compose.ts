import type { AnyKey, Key, KeyId } from "../key";
import { type Rule, rule } from ".";

export type ComposeSpec = {
  op: "compose";
  fields: Record<string, KeyId>;
};

export function compose<T extends Record<string, unknown>>(
  target: Key<T>,
  fields: { [K in keyof T]: Key<T[K]> },
): Rule<T> {
  const fieldEntries = Object.entries(fields) as [string, AnyKey][];
  const spec: ComposeSpec = {
    op: "compose",
    fields: Object.fromEntries(fieldEntries.map(([k, v]) => [k, v.id])),
  };
  const deps: AnyKey[] = fieldEntries.map(([, v]) => v);
  return rule({
    target,
    spec,
    deps,
    eval: (get) => {
      const output = {} as Record<string, unknown>;
      for (const [k, v] of fieldEntries) {
        output[k] = get(v);
      }
      return { output: output as T };
    },
  });
}
