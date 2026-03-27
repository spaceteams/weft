export type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | CanonicalJson[]
  | { [key: string]: CanonicalJson };

export function canonicalize(value: unknown): CanonicalJson {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (typeof value === "object" && value !== null) {
    if (value instanceof Date) {
      return value.toISOString();
    }
    const sortedKeys = Object.keys(value).sort();
    const obj = value as Record<string, unknown>;
    const out: Record<string, CanonicalJson> = {};
    for (const key of sortedKeys) {
      out[key] = canonicalize(obj[key]);
    }
    return out;
  }
  throw new Error(`Unsupported value for canonicalization: ${JSON.stringify(value)}`);
}
