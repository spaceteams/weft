import type { Key, KeyId } from "../key";
import { type Rule, rule } from ".";

export type PluckSpec = {
  op: "pluck";
  source: KeyId;
  path: readonly string[];
};

export function pluck<T, R>(
  target: Key<R>,
  source: Key<T>,
  path: string | readonly string[],
): Rule<R> {
  const segments = typeof path === "string" ? path.split(".") : path;
  const spec: PluckSpec = {
    op: "pluck",
    source: source.id,
    path: segments,
  };
  return rule({
    target,
    spec,
    deps: [source],
    eval: (get) => {
      let current: unknown = get(source);
      for (const segment of segments) {
        current = (current as Record<string, unknown>)[segment];
      }
      return { output: current as R };
    },
  });
}
