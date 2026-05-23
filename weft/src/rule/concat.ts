import type { AnyKey, Key, KeyId } from "../key";
import { type Rule, rule } from ".";

export type ConcatSpec = {
  op: "concat";
  parts: readonly KeyId[];
  separator: string;
};

export function concat(
  target: Key<string>,
  parts: readonly Key<string>[],
  separator?: string,
): Rule<string> {
  const sep = separator ?? "";
  const spec: ConcatSpec = {
    op: "concat",
    parts: parts.map((p) => p.id),
    separator: sep,
  };
  const deps: AnyKey[] = [...parts];
  return rule({
    target,
    spec,
    deps,
    eval: (get) => {
      const values = parts.map((p) => get(p));
      const output = values.join(sep);
      return { output, detail: { parts: values } };
    },
  });
}
