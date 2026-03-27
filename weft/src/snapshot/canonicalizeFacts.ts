import type { FactBag } from "../facts";
import type { CompiledModel } from "../model";
import type { CanonicalJson } from "./canonicalize";
import { canonicalizeValue } from "./canonicalizeValue";

export function canonicalizeFacts(
  model: CompiledModel,
  facts: FactBag,
): Record<string, CanonicalJson> {
  const result: Record<string, CanonicalJson> = {};
  for (const [key, value] of Object.entries(facts)) {
    result[key] = canonicalizeValue(model, key, value);
  }
  return result;
}
