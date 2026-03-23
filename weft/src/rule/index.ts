import type { Key } from "../key";

export type Resolver = <T>(key: Key<T>) => T;

export type Rule<T> = {
  readonly kind: "rule";
  readonly target: Key<T>;
  readonly deps: readonly Key<unknown>[];
  readonly eval: (get: Resolver) => T;
};

export function rule<T>(def: {
  target: Key<T>;
  deps: readonly Key<unknown>[];
  eval: (get: Resolver) => T;
}): Rule<T> {
  return {
    kind: "rule",
    target: def.target,
    deps: def.deps,
    eval: def.eval,
  };
}
