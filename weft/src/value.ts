export type Value<T> = {
  readonly __kind: "value";
  readonly value: T;
};

export function value<T>(value: T): Value<T> {
  return { __kind: "value", value };
}
