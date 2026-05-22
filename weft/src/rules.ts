/**
 * Rule definitions and factories.
 *
 * Rules are typed computation nodes that define how values are derived
 * from their dependencies. Each rule declares a target key, its dependencies,
 * and an evaluation function.
 *
 * Available rule types:
 * - `sum` — Sum of N keys
 * - `difference` — Subtraction of two keys
 * - `product` — Multiplication of N factors
 * - `negate` — Unary negation
 * - `minimum` / `maximum` — Min/Max of N keys
 * - `weightedSum` — Weighted sum with per-key weights
 * - `scale` — Multiply a value by a factor
 * - `ratio` — Division of two keys
 * - `clamp` — Bound a value between min and max
 * - `abs` — Absolute value
 * - `round` — Rounding (round/floor/ceil/trunc)
 * - `conditional` — If/then/else branching
 * - `futureValue` — Financial future value (FV)
 * - `presentValue` — Financial present value (PV)
 * - `annuityPayment` — Financial annuity payment (PMT)
 * - `projection` — Extract a field from a record-typed key
 * - `decision` — Decision table with predicates → output mapping
 */
export * from "./rule";
export * from "./rule/abs";
export * from "./rule/algebraic-rules";
export * from "./rule/clamp";
export * from "./rule/conditional";
export * from "./rule/decision";
export * from "./rule/difference";
export * from "./rule/financial";
export * from "./rule/min-max";
export * from "./rule/negate";
export * from "./rule/numeric-rules";
export * from "./rule/operand";
export * from "./rule/product";
export * from "./rule/projection";
export * from "./rule/ratio";
export * from "./rule/round";
export * from "./rule/rule-meta";
export * from "./rule/scale";
export * from "./rule/sum";
export * from "./rule/weighted-sum";
