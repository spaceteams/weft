import { createHash } from "node:crypto";
import { type CanonicalJson, canonicalize } from "./canonicalize";

export type Fingerprint = string;

function fingerprintCanonical(value: CanonicalJson): Fingerprint {
  // do some sha256 in the future
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function fingerprintValue(value: unknown): Fingerprint {
  return fingerprintCanonical(canonicalize(value));
}
