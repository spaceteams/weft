/**
 * Utilities for working with values that may be synchronous or asynchronous.
 * Keeps the sync path fast (no unnecessary Promise wrapping) while handling
 * async transparently.
 */

/** A value that may be synchronous or wrapped in a Promise. */
export type MaybeAsync<T> = T | Promise<T>;

/**
 * FlatMap/chain for MaybeAsync — transform a possibly-async value with a
 * function that may itself return sync or async.
 *
 * - If `value` is sync and `fn` returns sync → sync result
 * - If either is async → async result
 */
export function thenMaybe<T, U>(value: MaybeAsync<T>, fn: (v: T) => MaybeAsync<U>): MaybeAsync<U> {
  if (value instanceof Promise) return value.then(fn);
  return fn(value);
}

/**
 * Resolve an array of possibly-async values and apply `fn` to the results.
 *
 * - If all values are sync → `fn` is called synchronously
 * - If any value is async → returns a Promise that resolves after all settle
 */
export function mapAll<const T extends readonly unknown[], U>(
  values: { [K in keyof T]: MaybeAsync<T[K]> },
  fn: (resolved: T) => U,
): MaybeAsync<U> {
  const hasAsync = values.some((v) => v instanceof Promise);
  if (!hasAsync) return fn(values as unknown as T);
  return Promise.all(values).then((resolved) => fn(resolved as unknown as T));
}
