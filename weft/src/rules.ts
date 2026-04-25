/**
 * Rule definitions and factories.
 *
 * Rules are typed computation nodes that define how values are derived
 * from their dependencies. Each rule declares a target key, its dependencies,
 * and an evaluation function.
 *
 * Available rule types:
 * - `sum` — Sum of N keys
 * - `weightedSum` — Weighted sum with per-key weights
 * - `scale` — Multiply a value by a factor
 * - `ratio` — Division of two keys
 * - `projection` — Extract a field from a record-typed key
 * - `decision` — Decision table with predicates → output mapping
 */
export * from "./rule";
export * from "./rule/decision";
export * from "./rule/operand";
export * from "./rule/projection";
export * from "./rule/ratio";
export * from "./rule/rule-meta";
export * from "./rule/scale";
export * from "./rule/sum";
export * from "./rule/weighted-sum";
