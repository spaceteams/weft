import type { Key, KeyId } from "../key";
import { type Rule, rule } from ".";

export type RatioTraceDetail = {
  op: "project";
  source: KeyId;
  field: string;
};
export function projection<T extends Record<string, unknown>, K extends keyof T>(
  target: Key<T[K]>,
  source: Key<T>,
  field: K,
): Rule<T[K]> {
  return rule({
    target,
    deps: [source],
    eval: (get) => {
      const output = get(source)[field];
      const detail: RatioTraceDetail = {
        op: "project",
        source: source.id,
        field: String(field),
      };
      return { output, detail };
    },
  });
}
