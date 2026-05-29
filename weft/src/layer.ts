import type { KeyId } from "./key";
import type { Codec } from "./semantics/codec";

/**
 * A layer evaluator defines how a layer's values propagate through the
 * computation graph. It interprets rule specs independently of rule factories.
 */
export type LayerEvaluator<T = unknown> = {
  /** Unique layer identifier (e.g., "units", "provenance"). */
  readonly name: string;
  /** Version string for frozen artifact compatibility. */
  readonly version: string;
  /**
   * Given a rule's op, the layer values of its dependencies, and the full
   * rule spec, compute the target's layer value.
   *
   * Return `undefined` to indicate this layer has no value for this target (sparse).
   */
  eval(op: string, deps: ReadonlyMap<KeyId, T>, spec: Record<string, unknown>): T | undefined;
  /**
   * Optional fallback when the op is unknown or `eval` returns `undefined`.
   * If absent, the key simply has no value for this layer (sparse).
   */
  default?: (deps: ReadonlyMap<KeyId, T>) => T | undefined;
  /**
   * Codec for serialization into frozen artifacts.
   * When absent, layer values are canonicalized with the generic `canonicalize()`
   * function (same fallback pattern as `canonicalizeValue` for rule outputs).
   */
  codec?: Codec<T>;
};
