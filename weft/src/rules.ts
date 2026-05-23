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
 * - `match` — Decision table with typed predicate DSL (mixed-type conditions)
 * - `switchOn` — Single-source equality switch shorthand
 * - `rangeSwitch` — Numeric range lookup
 * - `when` — Fluent predicate builder for `match` tables
 * - `pick` — Extract multiple fields from a record-typed key
 * - `pluck` — Deep path extraction from nested objects
 * - `compose` — Construct an object from individual keys
 * - `spread` — Shallow-merge multiple object keys into one
 * - `mapEntries` — Transform all values in a record-typed key
 * - `concat` — String concatenation with optional separator
 * - `template` — String interpolation with `{key}` placeholders
 * - `format` — Value formatting via custom formatter function
 * - `logicalAnd` / `logicalOr` / `logicalNot` — Boolean logic
 * - `compare` — Comparison to boolean (eq, neq, gt, gte, lt, lte)
 * - `coerce` — Generic type conversion
 */
export * from "./rule";
export * from "./rule/abs";
export * from "./rule/algebraic-rules";
export * from "./rule/clamp";
export * from "./rule/coerce";
export * from "./rule/compare";
export * from "./rule/compose";
export * from "./rule/concat";
export * from "./rule/conditional";
export * from "./rule/decision-dsl";
export * from "./rule/difference";
export * from "./rule/financial";
export * from "./rule/format";
export * from "./rule/logical";
export * from "./rule/map-entries";
export * from "./rule/min-max";
export * from "./rule/negate";
export * from "./rule/numeric-rules";
export * from "./rule/operand";
export * from "./rule/pick";
export * from "./rule/pluck";
export * from "./rule/product";
export * from "./rule/projection";
export * from "./rule/ratio";
export * from "./rule/round";
export * from "./rule/scale";
export * from "./rule/spread";
export * from "./rule/sum";
export * from "./rule/template";
export * from "./rule/weighted-sum";
