export type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | CanonicalJson[]
  | { [key: string]: CanonicalJson };

/**
 * A canonical fact bag — the frozen counterpart of {@link FactBag}.
 * All values are canonicalized for deterministic serialization.
 */
export type CanonicalFactBag = Record<string, CanonicalJson>;

/**
 * Convert a value into canonical JSON, throwing on anything that cannot be
 * represented (undefined, functions, symbols, ...).
 *
 * @param value - The value to canonicalize.
 * @param path - Optional prefix describing where `value` sits in an enclosing
 *   structure (for instance `"trace.myKey.detail"` or `"values"`). The location
 *   of the actual offending field is derived from it during the recursion and
 *   appended to the error message, so a failure inside a deeply nested artifact
 *   names the field rather than only its type. Object keys are joined with `.`
 *   and array indices with `[]`. Omit it and the path is derived from `value`
 *   itself, which is usually what a caller validating a whole artifact wants.
 */
export function canonicalize(value: unknown, path?: string): CanonicalJson {
  return canonicalizeAt(value, path ?? "");
}

function canonicalizeAt(value: unknown, path: string): CanonicalJson {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => canonicalizeAt(entry, `${path}[${index}]`));
  }
  if (typeof value === "object" && value !== null) {
    if (value instanceof Date) {
      return value.toISOString();
    }
    const sortedKeys = Object.keys(value).sort();
    const obj = value as Record<string, unknown>;
    const out: Record<string, CanonicalJson> = {};
    for (const key of sortedKeys) {
      out[key] = canonicalizeAt(obj[key], path === "" ? key : `${path}.${key}`);
    }
    return out;
  }
  const where = path === "" ? "" : ` (at ${path})`;
  throw new Error(`Unsupported value for canonicalization: ${JSON.stringify(value)}${where}`);
}
