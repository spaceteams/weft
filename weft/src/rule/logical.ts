import type { AnyKey, Key, KeyId } from "../key";
import { type Rule, rule } from ".";

export type LogicalAndSpec = {
  op: "and";
  deps: readonly KeyId[];
};

export type LogicalOrSpec = {
  op: "or";
  deps: readonly KeyId[];
};

export type LogicalNotSpec = {
  op: "not";
  source: KeyId;
};

export function logicalAnd(target: Key<boolean>, deps: readonly Key<boolean>[]): Rule<boolean> {
  const spec: LogicalAndSpec = {
    op: "and",
    deps: deps.map((d) => d.id),
  };
  const allDeps: AnyKey[] = [...deps];
  return rule({
    target,
    spec,
    deps: allDeps,
    eval: (get) => {
      const values = deps.map((d) => get(d));
      const output = values.every(Boolean);
      return { output, detail: { values } };
    },
  });
}

export function logicalOr(target: Key<boolean>, deps: readonly Key<boolean>[]): Rule<boolean> {
  const spec: LogicalOrSpec = {
    op: "or",
    deps: deps.map((d) => d.id),
  };
  const allDeps: AnyKey[] = [...deps];
  return rule({
    target,
    spec,
    deps: allDeps,
    eval: (get) => {
      const values = deps.map((d) => get(d));
      const output = values.some(Boolean);
      return { output, detail: { values } };
    },
  });
}

export function logicalNot(target: Key<boolean>, source: Key<boolean>): Rule<boolean> {
  const spec: LogicalNotSpec = {
    op: "not",
    source: source.id,
  };
  return rule({
    target,
    spec,
    deps: [source],
    eval: (get) => {
      const output = !get(source);
      return { output };
    },
  });
}
