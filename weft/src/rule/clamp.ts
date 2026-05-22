import type { AnyKey, Key, KeyId } from "../key";
import type { OpsDescriptor, Order } from "../semantics/algebra";
import { type Rule, rule } from ".";
import { type Operand, resolveOperand } from "./operand";

export type ClampSpec = {
  op: "clamp";
  opsDescriptor: OpsDescriptor;
  value: KeyId;
  min: unknown;
  max: unknown;
};

export function clamp<T>(
  ops: OpsDescriptor & Order<T>,
  target: Key<T>,
  value: Key<T>,
  min: Operand<T>,
  max: Operand<T>,
): Rule<T> {
  const spec: ClampSpec = {
    op: "clamp",
    opsDescriptor: { family: ops.family, version: ops.version },
    value: value.id,
    min,
    max,
  };
  const deps: AnyKey[] = [value];
  if (min.__kind === "key") deps.push(min);
  if (max.__kind === "key") deps.push(max);
  return rule({
    target,
    spec,
    deps,
    eval: (get) => {
      const v = get(value);
      const lo = resolveOperand(min, get);
      const hi = resolveOperand(max, get);
      let output = v;
      if (ops.compare(v, lo) < 0) output = lo;
      else if (ops.compare(v, hi) > 0) output = hi;
      return { output, detail: { value: v, min: lo, max: hi, clamped: output !== v } };
    },
  });
}
