export type Formatter<T, C = void> = {
  format(value: T, context: C): string;
};
