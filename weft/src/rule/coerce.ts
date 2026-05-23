import type { Key, KeyId } from "../key";
import { type Rule, rule } from ".";

export type CoerceSpec = {
  op: "coerce";
  source: KeyId;
};

export function coerce<T, R>(target: Key<R>, source: Key<T>, fn: (value: T) => R): Rule<R> {
  const spec: CoerceSpec = {
    op: "coerce",
    source: source.id,
  };
  return rule({
    target,
    spec,
    deps: [source],
    eval: (get) => {
      const input = get(source);
      const output = fn(input);
      return { output };
    },
  });
}
