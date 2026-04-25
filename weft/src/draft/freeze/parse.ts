import type { FrozenEvaluatedDraft } from "./freeze-evaluated-draft";
import { migrateFrozenArtifact } from "./migrate";

/**
 * Parse and migrate a frozen artifact from unknown JSON to the current version.
 *
 * Accepts any version of a frozen artifact (including pre-versioning v0),
 * migrates it to the current schema, and returns a {@link FrozenEvaluatedDraft}.
 */
export function parseFrozenArtifact(json: unknown): FrozenEvaluatedDraft {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new Error("Frozen artifact must be a non-null object.");
  }

  const migrated = migrateFrozenArtifact(json as Record<string, unknown>);
  return migrated as unknown as FrozenEvaluatedDraft;
}
