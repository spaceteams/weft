import type { CanonicalJson, Codec, LayerEvaluator } from "@spaceteams/weft";

/**
 * Presentation hint for how a value should be displayed.
 * `"percent"` — multiplicative factor displayed as percentage (e.g. 0.12 → "12 %")
 * `"currency"` — monetary amount
 * `"date"` — calendar date
 * `"duration"` — time span
 * `"email"` — email address
 * `"url"` — hyperlink
 */
export type SemanticType = "percent" | "currency" | "date" | "duration" | "email" | "url";

/**
 * Display hints for a key in the computation model.
 * Both fields are optional — a key may have only a unit, only a semantic type,
 * or both.
 */
export type DisplayHints = {
  /** Physical or logical unit label, e.g. "kg", "EUR", "m/s". */
  unit?: string;
  /** Presentation hint for formatters and UI components. */
  semanticType?: SemanticType;
};

const codec: Codec<DisplayHints> = {
  encode(value: DisplayHints): CanonicalJson {
    const obj: Record<string, CanonicalJson> = {};
    if (value.semanticType !== undefined) {
      obj.semanticType = value.semanticType;
    }
    if (value.unit !== undefined) {
      obj.unit = value.unit;
    }
    return obj;
  },
  decode(value: CanonicalJson): DisplayHints {
    const obj = value as Record<string, CanonicalJson>;
    const hints: DisplayHints = {};
    if (typeof obj.unit === "string") {
      hints.unit = obj.unit;
    }
    if (typeof obj.semanticType === "string") {
      hints.semanticType = obj.semanticType as SemanticType;
    }
    return hints;
  },
};

/**
 * A non-propagating layer for `unit` and `semanticType` annotations.
 *
 * Only keys explicitly annotated via `m.annotate(key, "display-hints", …)`
 * will carry display hints. Rule targets do **not** inherit hints from their
 * dependencies — if you need a rule target to have hints, annotate it directly.
 */
export const displayHintsLayer: LayerEvaluator<DisplayHints> = {
  name: "display-hints",
  version: "1",
  eval() {
    return undefined;
  },
  codec,
};

/**
 * Convenience factory for creating a `DisplayHints` value.
 *
 * @example
 * ```ts
 * m.annotate(price, "display-hints", displayHint({ unit: "EUR", semanticType: "currency" }));
 * ```
 */
export function displayHint(opts: DisplayHints): DisplayHints {
  return opts;
}
