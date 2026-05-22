import { defaultNumberOps } from "../semantics/algebra";
import { algebraicRules } from "./algebraic-rules";

/**
 * Pre-bound numeric rule factories. Equivalent to `algebraicRules(defaultNumberOps)`.
 *
 * Use this for the most common case — standard numeric computations:
 *
 * @example
 * ```ts
 * import { numericRules as n, key, createModel } from "@spaceteams/weft";
 *
 * const a = key<number>("a");
 * const b = key<number>("b");
 * const total = key<number>("total");
 *
 * const m = createModel();
 * m.input(a);
 * m.input(b);
 * m.rule(n.sum(total, [a, b]));
 * m.rule(n.difference(total, a, b));
 * ```
 */
export const numericRules = algebraicRules(defaultNumberOps);
