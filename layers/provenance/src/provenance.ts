import type { CanonicalJson, Codec, KeyId, LayerEvaluator } from "@spaceteams/weft";

/**
 * Provenance tracks the source and confidence of a value in the computation model.
 */
export type Provenance = {
  /** The source of this value — e.g., "user-input", "GPS", "estimate", "derived" */
  readonly source: string;
  /** Confidence score 0..1 (1 = fully trusted, 0 = no confidence). Default: 1. */
  readonly confidence: number;
  /** Optional tags for additional classification (e.g., "audited", "provisional") */
  readonly tags?: readonly string[];
};

/**
 * Convenience factory for creating a `Provenance` value.
 *
 * @example
 * ```ts
 * m.annotate(sensor, "provenance", provenance("GPS", 0.9, ["field-measured"]));
 * ```
 */
export function provenance(source: string, confidence = 1, tags?: string[]): Provenance {
  return tags?.length ? { source, confidence, tags } : { source, confidence };
}

/**
 * Creates derived provenance from a set of dependency provenance values.
 * The confidence is the minimum across all deps.
 */
export function derived(deps: ReadonlyMap<KeyId, Provenance>): Provenance {
  if (deps.size === 0) {
    return { source: "unknown", confidence: 0 };
  }
  let min = 1;
  for (const p of deps.values()) {
    if (p.confidence < min) {
      min = p.confidence;
    }
  }
  return { source: "derived", confidence: min };
}

const codec: Codec<Provenance> = {
  encode(value: Provenance): CanonicalJson {
    const obj: Record<string, CanonicalJson> = {
      confidence: value.confidence,
      source: value.source,
    };
    if (value.tags?.length) {
      obj.tags = [...value.tags];
    }
    return obj;
  },
  decode(value: CanonicalJson): Provenance {
    return value as unknown as Provenance;
  },
};

/**
 * A source-tracking layer with confidence scores.
 *
 * Annotate inputs with `m.annotate(key, "provenance", provenance("user-input", 0.95))`.
 * Computed values automatically receive `source: "derived"` with the minimum confidence
 * of their dependencies.
 */
export const provenanceLayer: LayerEvaluator<Provenance> = {
  name: "provenance",
  version: "1",
  eval(_op, deps) {
    return derived(deps);
  },
  default(deps) {
    return derived(deps);
  },
  codec,
};
