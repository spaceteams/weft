import type { Key, KeyId } from "../key";
import type { Divisible, OpsDescriptor } from "../semantics/algebra";
import { type Rule, rule } from ".";

export type RatioTraceSpec = {
  op: "ratio";
  opsDescriptor: OpsDescriptor;
  numerator: KeyId;
  denominator: KeyId;
};
export function ratio<T, R>(
  ops: OpsDescriptor & Divisible<T, R>,
  target: Key<R>,
  numerator: Key<T>,
  denominator: Key<T>,
): Rule<R> {
  const spec: RatioTraceSpec = {
    op: "ratio",
    opsDescriptor: { family: ops.family, version: ops.version },
    numerator: numerator.id,
    denominator: denominator.id,
  };
  return rule({
    target,
    spec,
    deps: [numerator, denominator],
    eval: (get) => {
      const output = ops.div(get(numerator), get(denominator));
      return { output };
    },
  });
}
