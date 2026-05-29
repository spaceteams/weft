/**
 * v2 → v3:
 * - Adds optional `layers` field to frozen evaluated drafts (layer evaluation results).
 *   No data transformation needed — the field is simply absent on older artifacts.
 */
export function migrateV2toV3(artifact: Record<string, unknown>): Record<string, unknown> {
  return {
    ...artifact,
    version: 3,
  };
}
