import type { AnyKey, Key } from "../key";

export type Resolver = <T>(key: Key<T>) => T;

export type Rule<T> = {
  readonly __kind: "rule";
  readonly spec: Record<string, unknown>;
  readonly target: Key<T>;
  readonly deps: readonly AnyKey[];
  readonly eval: (get: Resolver) => { output: T; detail?: Record<string, unknown> };
};

export function rule<T>(def: {
  target: Key<T>;
  deps: readonly AnyKey[];
  spec: Record<string, unknown>;
  eval: (get: Resolver) => { output: T; detail?: Record<string, unknown> };
}): Rule<T> {
  return {
    __kind: "rule",
    spec: def.spec,
    target: def.target,
    deps: def.deps,
    eval: def.eval,
  };
}
