import type { KeyId } from "./key";

/**
 * Structural metadata about a registered layer.
 * Describes the layer's identity and the input annotations that seed it.
 *
 * Used in both `ModelStructure` (hydrated) and `FrozenLayerMeta` (serialized).
 */
export type LayerMeta = {
  readonly name: string;
  readonly version: string;
  readonly inputs?: Readonly<Record<KeyId, unknown>>;
};
