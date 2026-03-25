import type { Key, KeyId } from "../key";
import type { Additive } from "../semantics/algebra";
import { type Rule, rule } from ".";

export type SumTraceDetail = {
  op: "sum";
  deps: readonly KeyId[];
};
export function sum<T>(ops: Additive<T>, target: Key<T>, deps: readonly Key<T>[]): Rule<T> {
  return rule({
    target,
    deps,
    eval: (get) => {
      const output = deps.reduce((acc, b) => ops.add(acc, get(b)), ops.zero());
      const detail: SumTraceDetail = {
        op: "sum",
        deps: deps.map((d) => d.id),
      };
      return { output, detail };
    },
  });
}
