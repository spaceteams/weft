import type { KeyId } from "../key";
import type { CompiledModel } from "../model";
import type { ValueDelta } from "../overlay/diff-results";
import type { CanonicalJson } from "./canonicalize";
import { canonicalizeValue } from "./canonicalizeValue";

export type CanonicalDelta =
  | { readonly key: KeyId; readonly kind: "added"; readonly after: CanonicalJson }
  | { readonly key: KeyId; readonly kind: "removed"; readonly before: CanonicalJson }
  | {
      readonly key: KeyId;
      readonly kind: "changed";
      readonly before: CanonicalJson;
      readonly after: CanonicalJson;
    };
export function canonicalizeDelta(model: CompiledModel, delta: ValueDelta): CanonicalDelta {
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
