/**
 * Optional presentation hint for cases where JSON Schema alone is ambiguous.
 *
 * Consumers (e.g. UI frameworks) can use this to select appropriate
 * input widgets or formatters without guessing from schema constraints.
 */
export type SemanticType = "percent" | "currency" | "date" | "duration" | "email" | "url";

export type KeyMeta = {
  readonly label?: string;
  readonly description?: string;
  readonly group?: string;
  readonly unit?: string;
  readonly order?: number;
  /**
   * Optional presentation hint for cases where JSON Schema alone is ambiguous.
   *
   * For example, a number with `min: 0, max: 1` could be either a raw decimal
   * or a percentage — `semanticType: "percent"` removes that ambiguity.
   *
   * Consumers can still infer presentation from JSON Schema + unit when this
   * is not set; explicit is simply better than inferred.
   */
  readonly semanticType?: SemanticType;
};
