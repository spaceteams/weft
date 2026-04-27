import { migrateV0toV1 } from "./migrations/v0-to-v1";
import { CURRENT_FROZEN_VERSION } from "./version";

type Migration = (artifact: Record<string, unknown>) => Record<string, unknown>;

const migrations: Record<number, Migration> = {
  0: migrateV0toV1,
};

/**
 * Migrate a frozen artifact from any version to the current version.
 *
 * Artifacts without a `version` field are treated as version 0 (pre-versioning).
 * Throws if the artifact's version is newer than the current version or if a
 * required migration is missing.
 */
export function migrateFrozenArtifact(artifact: Record<string, unknown>): Record<string, unknown> {
  let version = typeof artifact.version === "number" ? artifact.version : 0;

  if (version > CURRENT_FROZEN_VERSION) {
    throw new Error(
      `Frozen artifact version ${version} is newer than the current version ${CURRENT_FROZEN_VERSION}. ` +
        `Please upgrade @spaceteams/weft to read this artifact.`,
    );
  }

  let current = { ...artifact };
  while (version < CURRENT_FROZEN_VERSION) {
    const migration = migrations[version];
    if (!migration) {
      throw new Error(
        `No migration found for frozen artifact version ${version} → ${version + 1}.`,
      );
    }
    current = migration(current);
    version++;
  }

  return current;
}
