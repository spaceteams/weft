import type { CanonicalJson } from "../snapshot/canonicalize";

export type Codec<T> = {
  encode: (value: T) => CanonicalJson;
  decode: (value: CanonicalJson) => T;
};
