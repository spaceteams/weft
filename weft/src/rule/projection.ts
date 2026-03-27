import type { Key, KeyId } from "../key";
import { type Rule, rule } from ".";

export type ProjectionSpec = {
  op: "project";
  source: KeyId;
  field: string;
};
export function projection<T extends Record<string, unknown>, K extends keyof T>(
  target: Key<T[K]>,
  source: Key<T>,
  field: K,
): Rule<T[K]> {
  const spec: ProjectionSpec = {
    op: "project",
    source: source.id,
    field: String(field),
  };
  return rule({
    target,
    spec,
    deps: [source],
    eval: (get) => {
      const input = get(source);
      const output = input[field];
      return { output };
    },
  });
}
