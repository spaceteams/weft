import type { Equality } from "./semantics/algebra";
import type { Codec } from "./semantics/codec";
import type { Normalizer } from "./semantics/formatter";

export type KeySemantics<T> = Equality<T> & Normalizer<T> & Codec<T>;

export type KeyId = string;
export type Key<T> = {
  readonly id: KeyId;
  readonly __kind: "key";
  readonly __value?: T;
};

export type AnyKey = Key<any>;

export function key<T>(id: KeyId): Key<T> {
  return { __kind: "key", id };
}
