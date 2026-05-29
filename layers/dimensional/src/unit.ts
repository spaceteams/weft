/**
 * A rational unit representation using sorted base-unit arrays.
 *
 * `num` lists the base units in the numerator, `denom` in the denominator.
 * Both arrays are kept sorted alphabetically so structural equality works.
 *
 * Examples:
 * - metres:          `{ num: ["m"], denom: [] }`
 * - metres per second: `{ num: ["m"], denom: ["s"] }`
 * - dimensionless:   `{ num: [], denom: [] }`
 */
export type Unit = {
  readonly num: readonly string[];
  readonly denom: readonly string[];
};

/** Create a base unit, e.g. `unit("m")` → `{ num: ["m"], denom: [] }`. */
export function unit(name: string): Unit {
  return { num: [name], denom: [] };
}

/** The dimensionless unit (scalar). */
export function dimensionless(): Unit {
  return { num: [], denom: [] };
}

/** Create an arbitrary compound unit from numerator and denominator base units. */
export function compoundUnit(num: readonly string[], denom: readonly string[]): Unit {
  const result = cancelCommon([...num], [...denom]);
  return { num: result.num.sort(), denom: result.denom.sort() };
}

/** Multiply two units: `(a·b)`. Combines numerators and denominators, cancelling common factors. */
export function multiplyUnits(a: Unit, b: Unit): Unit {
  return compoundUnit([...a.num, ...b.num], [...a.denom, ...b.denom]);
}

/** Divide two units: `a / b`. */
export function divideUnits(a: Unit, b: Unit): Unit {
  return compoundUnit([...a.num, ...b.denom], [...a.denom, ...b.num]);
}

/** Structural equality of two units. */
export function unitsEqual(a: Unit, b: Unit): boolean {
  return arraysEqual(a.num, b.num) && arraysEqual(a.denom, b.denom);
}

/**
 * Format a unit as a human-readable string.
 *
 * - `"m"`, `"kg"` — simple base unit
 * - `"m/s"` — single numerator / single denominator
 * - `"m²"` — repeated base unit uses superscript exponents
 * - `"kg·m/s²"` — full compound unit
 * - `"1"` — dimensionless
 * - `"1/s"` — pure denominator
 */
export function formatUnit(u: Unit): string {
  const numStr = formatHalf(u.num);
  const denomStr = formatHalf(u.denom);

  if (numStr === "" && denomStr === "") return "1";
  if (denomStr === "") return numStr;
  if (numStr === "") return `1/${denomStr}`;
  return `${numStr}/${denomStr}`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const superscripts: Record<number, string> = {
  2: "²",
  3: "³",
  4: "⁴",
  5: "⁵",
  6: "⁶",
  7: "⁷",
  8: "⁸",
  9: "⁹",
};

function formatHalf(units: readonly string[]): string {
  if (units.length === 0) return "";
  const counts = new Map<string, number>();
  for (const u of units) {
    counts.set(u, (counts.get(u) ?? 0) + 1);
  }
  const parts: string[] = [];
  for (const [name, count] of [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (count === 1) {
      parts.push(name);
    } else {
      parts.push(`${name}${superscripts[count] ?? `^${count}`}`);
    }
  }
  return parts.join("·");
}

function cancelCommon(num: string[], denom: string[]): { num: string[]; denom: string[] } {
  const remaining = [...denom];
  const canceled: string[] = [];
  for (const u of num) {
    const idx = remaining.indexOf(u);
    if (idx >= 0) {
      remaining.splice(idx, 1);
    } else {
      canceled.push(u);
    }
  }
  return { num: canceled, denom: remaining };
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
