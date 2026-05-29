import type { KeyId, LayerEvaluator } from "@spaceteams/weft";
import type { Unit } from "./unit";
import { dimensionless, divideUnits, multiplyUnits, unitsEqual } from "./unit";

/**
 * SI-style dimensional analysis layer for weft computation models.
 *
 * Propagates {@link Unit} values through the computation graph based on each
 * rule's `op`. When units are incompatible (e.g. adding metres to seconds),
 * the layer returns `undefined` — it never throws.
 */
export const dimensionalLayer: LayerEvaluator<Unit> = {
  name: "units",
  version: "1",

  eval(
    op: string,
    deps: ReadonlyMap<KeyId, Unit>,
    spec: Record<string, unknown>,
  ): Unit | undefined {
    switch (op) {
      // ── Additive ops: all deps must share the same unit ──────────────
      case "sum":
      case "difference":
      case "weighted-sum":
      case "min":
      case "max":
        return requireSameUnit(deps);

      // ── Ratio: numerator / denominator ───────────────────────────────
      case "ratio": {
        const numKey = spec.numerator as KeyId | undefined;
        const denomRaw = spec.denominator;
        const denomKey =
          typeof denomRaw === "string"
            ? (denomRaw as KeyId)
            : typeof denomRaw === "object" && denomRaw !== null && "id" in denomRaw
              ? ((denomRaw as { id: KeyId }).id as KeyId)
              : undefined;

        const numUnit = numKey ? deps.get(numKey) : undefined;
        const denomUnit = denomKey ? deps.get(denomKey) : undefined;

        if (!numUnit || !denomUnit) return undefined;
        return divideUnits(numUnit, denomUnit);
      }

      // ── Multiplicative ops: multiply all dep units ───────────────────
      case "scale":
      case "product":
        return multiplyAllUnits(deps);

      // ── Unary passthrough: inherit from single source ────────────────
      case "negate":
      case "abs":
      case "clamp":
      case "round":
        return firstUnit(deps);

      // ── Conditional: inherit from then/otherwise branch ──────────────
      case "conditional": {
        const condKey = spec.condition as KeyId | undefined;
        for (const [id, u] of deps) {
          if (id !== condKey) return u;
        }
        return undefined;
      }

      // ── Financial ops: preserve the monetary unit from pv/fv ─────────
      case "future-value":
      case "annuity-payment":
      case "present-value":
        return financialUnit(deps, spec);

      // ── Match: inherit from the matched output ───────────────────────
      case "match":
        return firstUnit(deps);

      // ── Boolean / structural ops: dimensionless ──────────────────────
      case "compare":
      case "and":
      case "or":
      case "not":
      case "coerce":
      case "format":
        return dimensionless();

      // ── Structural ops: no unit propagation ──────────────────────────
      case "project":
      case "pluck":
      case "pick":
      case "compose":
      case "spread":
        return undefined;

      // ── Unknown op: return first dep unit if all match ───────────────
      default:
        return requireSameUnit(deps);
    }
  },

  codec: {
    encode: (u: Unit) => ({ num: [...u.num], denom: [...u.denom] }),
    decode: (j) => j as unknown as Unit,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireSameUnit(deps: ReadonlyMap<KeyId, Unit>): Unit | undefined {
  let result: Unit | undefined;
  for (const u of deps.values()) {
    if (result === undefined) {
      result = u;
    } else if (!unitsEqual(result, u)) {
      return undefined;
    }
  }
  return result;
}

function multiplyAllUnits(deps: ReadonlyMap<KeyId, Unit>): Unit | undefined {
  const values = [...deps.values()];
  if (values.length === 0) return undefined;
  let result = values[0];
  for (let i = 1; i < values.length; i++) {
    result = multiplyUnits(result, values[i]);
  }
  return result;
}

function firstUnit(deps: ReadonlyMap<KeyId, Unit>): Unit | undefined {
  for (const u of deps.values()) {
    return u;
  }
  return undefined;
}

function financialUnit(
  deps: ReadonlyMap<KeyId, Unit>,
  spec: Record<string, unknown>,
): Unit | undefined {
  // Financial specs store the monetary operand as pv (future-value, annuity-payment)
  // or fv (present-value). These can be Operand types (key ref or literal value).
  const monetaryOperand = (spec.pv ?? spec.fv) as KeyId | { __kind: string; id: KeyId } | undefined;

  if (monetaryOperand === undefined) return undefined;

  const monetaryKey =
    typeof monetaryOperand === "string"
      ? (monetaryOperand as KeyId)
      : typeof monetaryOperand === "object" && monetaryOperand !== null && "id" in monetaryOperand
        ? (monetaryOperand.id as KeyId)
        : undefined;

  if (!monetaryKey) return undefined;
  return deps.get(monetaryKey);
}
