export type Equality<T> = {
  eq(a: T, b: T): boolean;
};

export type Order<T> = Equality<T> & {
  compare(a: T, b: T): -1 | 0 | 1;
};

export type Additive<T> = Equality<T> & {
  zero(): T;
  add(a: T, b: T): T;
  sub(a: T, b: T): T;
};

export type Scalable<T, S> = {
  one(): S;
  scale(value: T, factor: S): T;
};

export type Divisible<T, R> = {
  div(a: T, b: T): R;
};

export const defaultOps: Equality<unknown> = {
  eq: Object.is,
};

export const defaultNumberOps: Order<number> &
  Additive<number> &
  Scalable<number, number> &
  Divisible<number, number> = {
  eq: (a, b) => a === b,
  compare: (a, b) => (a < b ? -1 : a > b ? 1 : 0),
  zero: () => 0,
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
  one: () => 1,
  scale: (value, factor) => value * factor,
  div: (a, b) => a / b,
};
