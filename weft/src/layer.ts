import type { KeyId } from "./key";
import type { Codec } from "./semantics/codec";

/**
 * A layer evaluator defines how a layer's values propagate through the
 * computation graph. It interprets rule specs independently of rule factories.
 *
 * @typeParam T - The type of value this layer produces. Orthogonal to the type
 *   of the rule outputs it inspects.
 */
export type LayerEvaluator<T = unknown> = {
  /** Unique layer identifier (e.g., "units", "provenance"). */
  readonly name: string;
  /**
   * Version string for frozen artifact compatibility. Bump this whenever the
   * layer's propagation semantics change, so a frozen artifact records which
   * behaviour produced its values.
   */
  readonly version: string;
  /**
   * Given a rule's op, the layer values of its dependencies, the full rule
   * spec, and the rule's computed output, compute the target's layer value.
   *
   * Return `undefined` to indicate this layer has no value for this target (sparse).
   *
   * `output` is the value the rule's `eval` produced, which lets a layer
   * interpret the thing it annotates — a currency-formatting layer can read the
   * number, a provenance layer can see whether the output was a literal.
   *
   * It is typed `unknown` and that is deliberate: `CompiledModel.ruleByTarget`
   * is a heterogeneous `ReadonlyMap<KeyId, Rule<unknown>>`, so the dispatch loop
   * in `evaluate` has already erased each rule's output type by the time any
   * layer runs. Narrow it yourself. Since `unknown` includes `undefined`, an
   * implementation may declare this parameter however it likes; it is optional
   * only so that direct three-argument calls to `eval` keep compiling.
   */
  eval(
    op: string,
    deps: ReadonlyMap<KeyId, T>,
    spec: Record<string, unknown>,
    output?: unknown,
  ): T | undefined;
  /**
   * Optional fallback when the op is unknown or `eval` returns `undefined`.
   * If absent, the key simply has no value for this layer (sparse).
   */
  default?: (deps: ReadonlyMap<KeyId, T>, output?: unknown) => T | undefined;
  /**
   * Codec for serialization into frozen artifacts.
   * When absent, layer values are canonicalized with the generic `canonicalize()`
   * function (same fallback pattern as `canonicalizeValue` for rule outputs).
   */
  codec?: Codec<T>;
};
