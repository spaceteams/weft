import type { CompiledModel } from "../model";
import type { ValueDelta } from "../overlay/diff-results";
import { canonicalizeValue } from "./canonicalizeValue";

export function canonicalizeDelta(model: CompiledModel, delta: ValueDelta): ValueDelta {
  switch (delta.kind) {
    case "added":
      return {
        key: delta.key,
        kind: "added",
        after: canonicalizeValue(model, delta.key, delta.after),
      };
    case "removed":
      return {
        key: delta.key,
        kind: "removed",
        before: canonicalizeValue(model, delta.key, delta.before),
      };
    case "changed":
      return {
        key: delta.key,
        kind: "changed",
        before: canonicalizeValue(model, delta.key, delta.before),
        after: canonicalizeValue(model, delta.key, delta.after),
      };
  }
}
