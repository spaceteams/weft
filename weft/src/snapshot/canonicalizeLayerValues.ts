import type { LayerResults } from "../evaluate/evaluation-result";
import type { LayerEvaluator } from "../layer";
import type { CanonicalFactBag } from "./canonicalize";
import { canonicalize } from "./canonicalize";

/**
 * Frozen layer values: a record from layer name to a canonical fact bag
 * of that layer's computed values (sparse — only keys with values).
 */
export type FrozenLayerValues = Readonly<Record<string, CanonicalFactBag>>;

/**
 * Canonicalize all layer evaluation results.
 *
 * Uses the layer's codec if available; otherwise falls back to generic
 * canonicalization (same pattern as `canonicalizeValue`).
 */
export function canonicalizeLayerValues(
  // biome-ignore lint: Layer evaluators are stored type-erased
  layers: readonly LayerEvaluator<any>[],
  layerResults: LayerResults,
): FrozenLayerValues | undefined {
  if (layerResults.size === 0) return undefined;

  const result: Record<string, CanonicalFactBag> = {};
  for (const [layerName, layerValues] of layerResults) {
    const evaluator = layers.find((l) => l.name === layerName);
    const frozen: CanonicalFactBag = {};
    for (const [keyId, value] of layerValues) {
      if (evaluator?.codec) {
        frozen[keyId] = evaluator.codec.encode(value);
      } else {
        frozen[keyId] = canonicalize(value);
      }
    }
    result[layerName] = frozen;
  }
  return result;
}
