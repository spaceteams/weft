export type Formatter<T, C = void> = {
  format(value: T, context: C): string;
};

export type Normalizer<T> = {
  normalize(value: T): T;
};
