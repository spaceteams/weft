import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { type CanonicalJson, canonicalize } from "./canonicalize";

export type Fingerprint = string;

/**
 * Which `snapshotFrozenModel` projection produced the fingerprints in an
 * artifact's `snapshot`.
 *
 * This is a distinct axis from `CURRENT_FROZEN_VERSION`, and conflating them is
 * a trap: `CURRENT_FROZEN_VERSION` is the artifact *schema* version and is bumped
 * by migration, so it ends up equal to the current version on every artifact a
 * `parseFrozenArtifact` call returns — including one migrated up from an older
 * shape. That makes it useless for deciding whether two fingerprints are
 * comparable. This value is written per-artifact and deliberately left alone by
 * migration, so it survives.
 *
 * Bump it whenever `snapshotFrozenModel` changes what it covers. Consumers must
 * check it before comparing fingerprints; equal values are still not sufficient
 * to compare, since a fingerprint also depends on the model.
 */
export const CURRENT_FINGERPRINT_VERSION = 4;

const textEncoder = new TextEncoder();

function fingerprintCanonical(value: CanonicalJson): Fingerprint {
  return bytesToHex(sha256(textEncoder.encode(JSON.stringify(value))));
}

/**
 * Hash a value to a stable hex digest, canonicalizing it first.
 *
 * Key order is sorted by {@link canonicalize}, which is what makes the digest
 * deterministic across equivalent inputs — and therefore what makes two frozen
 * artifacts from two builds of one commit comparable.
 *
 * The digest is plain SHA-256, computed in pure JavaScript rather than via
 * `node:crypto`. That keeps every subpath browser- and edge-safe, which matters
 * because a fingerprint's whole purpose is to be recomputed from a frozen
 * artifact, and a frozen artifact is client-side data. It also means the digest
 * cannot vary with the platform, whereas a `crypto.subtle` implementation would
 * have to be async and so could not keep this signature.
 *
 * Beware substituting anything *derived* from a rule body. Hashing
 * `fn.toString()` looks like it would catch arithmetic drift and does not:
 * closure capture is invisible, so ops-aware factories — `ratio`'s body reads
 * `ops.div(a, b)` and never names `ops` — hash identically across algebras, and
 * minification renames identifiers so two builds of one commit differ. See
 * {@link ModelOptions.version} for the supported way to record behaviour.
 */
export function fingerprintValue(value: unknown): Fingerprint {
  return fingerprintCanonical(canonicalize(value));
}
