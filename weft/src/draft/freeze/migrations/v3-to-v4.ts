/**
 * The `snapshotFrozenModel` projection that pre-v4 artifacts were fingerprinted
 * against: `{ inputKeys, rules: [{ target, spec }] }`.
 *
 * Module-private: only this migration needs it. It exists as a named constant
 * rather than a bare `3` because a literal sitting next to `version: 4` reads as
 * the previous *artifact* version, which is a different axis — see
 * `CURRENT_FINGERPRINT_VERSION` in `snapshot/fingerprint.ts`.
 */
const PREV_FINGERPRINT_VERSION = 3;

/**
 * v3 → v4:
 * - `modelFingerprint` and `analysisFingerprint` now hash the whole frozen
 *   model — `version`, `keyMeta`, dependency topology, `orderedRuleTargets`,
 *   `jsonSchemas`, `keyValueTypes`, `constraints`, and each layer's `name`,
 *   `version`, and `inputs` — via `snapshotFrozenModel`. Previously they hashed
 *   only `{ inputKeys, rules: [{ target, spec }] }`.
 * - Adds `snapshot.fingerprintVersion`.
 * - No data transformation is needed for the digests themselves, and none is
 *   possible: a fingerprint depends on the *model*, which this migration is not
 *   handed.
 *
 * **`snapshot.fingerprintVersion` is set to the previous value, not to 4.**
 * That is the point of the migration. Stamping `version: 4` without touching the
 * digests would make a migrated artifact indistinguishable from a natively frozen
 * one, even though recomputing its `modelFingerprint` under the v4 projection
 * cannot match — and `parseFrozenArtifact` migrates unconditionally, so a consumer
 * would have no other way to tell. Setting the field preserves that signal.
 *
 * `baseFingerprint` and `overlayFingerprint` are deliberately left alone: they
 * hash `draft.base` and `draft.overlay`, which this version change does not
 * touch, so they remain valid.
 */
export function migrateV3toV4(artifact: Record<string, unknown>): Record<string, unknown> {
  const { snapshot } = artifact;
  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) {
    // Malformed snapshot — `parseFrozenArtifact` reports it via
    // `validateFrozenArtifact`. Stamp only the artifact version here.
    return { ...artifact, version: 4 };
  }
  return {
    ...artifact,
    version: 4,
    snapshot: {
      ...(snapshot as Record<string, unknown>),
      fingerprintVersion: PREV_FINGERPRINT_VERSION,
    },
  };
}
