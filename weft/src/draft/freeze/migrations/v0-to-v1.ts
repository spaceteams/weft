/**
 * v0 → v1:
 * - Adds `version: 1`
 * - Backfills `trace: []` if missing
 */
export function migrateV0toV1(artifact: Record<string, unknown>): Record<string, unknown> {
  return {
    ...artifact,
    version: 1,
    trace: artifact.trace ?? [],
  };
}
