/**
 * v1 → v2:
 * - Renames `ruleMeta` → `keyMeta` on trace steps (unified key metadata)
 * - Removes top-level `ruleMeta` field from the frozen model (if embedded)
 */
export function migrateV1toV2(artifact: Record<string, unknown>): Record<string, unknown> {
  const trace = Array.isArray(artifact.trace) ? artifact.trace.map(migrateTraceStep) : [];
  return {
    ...artifact,
    version: 2,
    trace,
  };
}

function migrateTraceStep(step: Record<string, unknown>): Record<string, unknown> {
  if (!("ruleMeta" in step)) return step;

  const { ruleMeta, ...rest } = step;
  // Merge into existing keyMeta if present, otherwise promote ruleMeta as keyMeta
  const existing = (rest.keyMeta ?? {}) as Record<string, unknown>;
  const migrated = (ruleMeta ?? {}) as Record<string, unknown>;
  return {
    ...rest,
    keyMeta: { ...migrated, ...existing },
  };
}
