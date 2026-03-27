import type { KeyId } from "./key";

export type FactBag = Record<KeyId, unknown>;

export function mapToFactBag(map: ReadonlyMap<string, unknown>): FactBag {
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
}
