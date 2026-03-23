import type { Equality } from "./semantics/algebra";

export type KeySemantics<T> = Equality<T>;

export type KeyId = string;
export type Key<T> = {
  readonly id: KeyId;
  readonly __value?: T;
  readonly semantics?: KeySemantics<T>;
};

export function key<T>(id: KeyId): Key<T> {
  return { id };
}
