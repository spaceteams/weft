import type { Key } from "../key";
import type {
  Additive,
  Divisible,
  Exponential,
  OpsDescriptor,
  Order,
  Scalable,
} from "../semantics/algebra";
import type { Rule } from ".";
import { abs } from "./abs";
import { clamp } from "./clamp";
import { difference } from "./difference";
import { annuityPayment, futureValue, presentValue } from "./financial";
import { maximum, minimum } from "./min-max";
import { negate } from "./negate";
import type { Operand } from "./operand";
import { product } from "./product";
import { ratio } from "./ratio";
import { scale } from "./scale";
import { sum } from "./sum";
import { weightedSum } from "./weighted-sum";

/**
 * Returns a set of **algebraic** rule factories pre-bound to the given ops.
 *
 * Only rules that depend on algebra traits (arithmetic, comparison, financial)
 * are included. Rules that don't need algebra (like `round`, `conditional`,
 * and future string/object rules) remain standalone factories.
 *
 * Use `numericRules` for the common case with `defaultNumberOps`.
 * Use `algebraicRules(myOps)` for custom types (e.g., BigDecimal).
 *
 * @example
 * ```ts
 * import { algebraicRules, defaultNumberOps, key, createModel } from "@spaceteams/weft";
 *
 * const n = algebraicRules(defaultNumberOps);
 * const a = key<number>("a");
 * const b = key<number>("b");
 * const total = key<number>("total");
 *
 * const m = createModel();
 * m.input(a);
 * m.input(b);
 * m.rule(n.sum(total, [a, b]));
 * ```
 */
export function algebraicRules<T>(
  ops: OpsDescriptor & Order<T> & Additive<T> & Scalable<T, T> & Divisible<T, T> & Exponential<T>,
) {
  return {
    /** Sum of N dependencies. */
    sum: (target: Key<T>, deps: readonly Key<T>[]): Rule<T> => sum(ops, target, deps),

    /** Subtraction: minuend − subtrahend. */
    difference: (target: Key<T>, minuend: Key<T>, subtrahend: Key<T>): Rule<T> =>
      difference(ops, target, minuend, subtrahend),

    /** Multiplication of N factors. */
    product: (target: Key<T>, factors: readonly Key<T>[]): Rule<T> => product(ops, target, factors),

    /** Unary negation: −source. */
    negate: (target: Key<T>, source: Key<T>): Rule<T> => negate(ops, target, source),

    /** Division: numerator / denominator. */
    ratio: (target: Key<T>, numerator: Key<T>, denominator: Key<T>): Rule<T> =>
      ratio(ops, target, numerator, denominator),

    /** Multiply value by factor. */
    scale: (target: Key<T>, input: Key<T>, factor: Key<T>): Rule<T> =>
      scale(ops, target, input, factor),

    /** Minimum of N keys. */
    minimum: (target: Key<T>, deps: readonly Key<T>[]): Rule<T> => minimum(ops, target, deps),

    /** Maximum of N keys. */
    maximum: (target: Key<T>, deps: readonly Key<T>[]): Rule<T> => maximum(ops, target, deps),

    /** Absolute value. */
    abs: (target: Key<T>, source: Key<T>): Rule<T> => abs(ops, target, source),

    /** Bound a value between min and max. */
    clamp: (target: Key<T>, v: Key<T>, min: Operand<T>, max: Operand<T>): Rule<T> =>
      clamp(ops, target, v, min, max),

    /** Weighted sum with per-entry weights. */
    weightedSum: (target: Key<T>, deps: readonly { key: Key<T>; weight: Operand<T> }[]): Rule<T> =>
      weightedSum(ops, target, deps),

    /** Financial future value: FV = PV × (1+r)^n + PMT × ((1+r)^n − 1) / r */
    futureValue: (target: Key<T>, rate: Key<T>, nper: Key<T>, pmt: Key<T>, pv: Key<T>): Rule<T> =>
      futureValue(ops, target, rate, nper, pmt, pv),

    /** Financial present value: PV = FV / (1+r)^n − PMT × ((1+r)^n − 1) / (r × (1+r)^n) */
    presentValue: (target: Key<T>, rate: Key<T>, nper: Key<T>, pmt: Key<T>, fv: Key<T>): Rule<T> =>
      presentValue(ops, target, rate, nper, pmt, fv),

    /** Financial annuity payment: PMT = PV × r × (1+r)^n / ((1+r)^n − 1) */
    annuityPayment: (target: Key<T>, rate: Key<T>, nper: Key<T>, pv: Key<T>): Rule<T> =>
      annuityPayment(ops, target, rate, nper, pv),
  };
}
