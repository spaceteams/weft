import type { Key, KeyId } from "../key";
import { type Rule, rule } from ".";

export type FormatSpec = {
  op: "format";
  source: KeyId;
};

export function format<T>(
  target: Key<string>,
  source: Key<T>,
  formatter: (value: T) => string,
): Rule<string> {
  const spec: FormatSpec = {
    op: "format",
    source: source.id,
  };
  return rule({
    target,
    spec,
    deps: [source],
    eval: (get) => {
      const input = get(source);
      const output = formatter(input);
      return { output };
    },
  });
}
