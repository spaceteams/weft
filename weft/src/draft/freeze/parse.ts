import type { FrozenEvaluatedDraft } from "./freeze-evaluated-draft";
import { migrateFrozenArtifact } from "./migrate";
import { frozenArtifactErrorMessage, validateFrozenArtifact } from "./validate-artifact";

/**
 * Parse and migrate a frozen artifact from unknown JSON to the current version.
 *
 * Accepts any version of a frozen artifact (including pre-versioning v0),
 * migrates it to the current schema, validates its structure, and returns a
 * {@link FrozenEvaluatedDraft}.
 *
 * Migration only checks the `version` field, so without the validation step an
 * artifact claiming the current version but missing (or mistyping) a field would
 * pass through and fail later, far from its cause. Validation therefore runs
 * after migration and throws when the artifact is not well formed.
 *
 * To inspect an artifact without throwing — for instance to decide whether a
 * cached copy should be re-fetched — use {@link validateFrozenArtifact}
 * directly, or {@link migrateFrozenArtifact} to skip validation entirely.
 *
 * @throws If `json` is not a non-null object, if its version is newer than
 *   {@link CURRENT_FROZEN_VERSION}, if no migration path exists, or if the
 *   migrated artifact is structurally malformed.
 */
export function parseFrozenArtifact(json: unknown): FrozenEvaluatedDraft {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new Error("Frozen artifact must be a non-null object.");
  }

  const migrated = migrateFrozenArtifact(json as Record<string, unknown>);

  const problems = validateFrozenArtifact(migrated);
  if (problems.length > 0) {
    throw new Error(frozenArtifactErrorMessage(problems));
  }

  return migrated as unknown as FrozenEvaluatedDraft;
}
