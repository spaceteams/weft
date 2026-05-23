import type { Key, KeyId } from "../key";
import { type Rule, rule } from ".";

export type PickSpec = {
  op: "pick";
  source: KeyId;
  fields: readonly string[];
};

export function pick<T extends Record<string, unknown>, K extends keyof T & string>(
  target: Key<Pick<T, K>>,
  source: Key<T>,
  fields: readonly K[],
): Rule<Pick<T, K>> {
  const spec: PickSpec = {
    op: "pick",
    source: source.id,
    fields,
  };
  return rule({
    target,
    spec,
    deps: [source],
    eval: (get) => {
      const input = get(source);
      const output = {} as Pick<T, K>;
      for (const f of fields) {
        (output as Record<string, unknown>)[f] = input[f];
      }
      return { output };
    },
  });
}
