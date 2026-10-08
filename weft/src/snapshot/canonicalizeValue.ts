import type { KeyId } from "../key";
import type { CompiledModel } from "../model";
import { type CanonicalJson, canonicalize } from "./canonicalize";

export function canonicalizeValue(
  model: CompiledModel,
  key: KeyId,
  value: unknown,
  path?: string,
): CanonicalJson {
  const semantics = model.semantics.get(key);
  if (semantics?.encode) {
    return semantics.encode(value);
  } else {
    return canonicalize(value, path);
  }
}
