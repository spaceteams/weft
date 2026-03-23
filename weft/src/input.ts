import type { Key } from "./key";

export type Input<T> = {
  readonly kind: "input";
  readonly key: Key<T>;
};

export function input<T>(key: Key<T>): Input<T> {
  return {
    kind: "input",
    key,
  };
}
