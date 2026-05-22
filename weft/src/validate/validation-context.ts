/**
 * Validation context allows lifecycle-dependent strictness.
 * Schemas can inspect the context to decide which constraints apply.
 *
 * Passed through to schema validate calls via `StandardSchemaV1.Options.libraryOptions`.
 * Schemas that are context-aware can inspect it; schemas that aren't simply ignore it.
 *
 * @example
 * ```ts
 * validateFacts(model, facts, { phase: "submit" });
 * validateOverlay(model, overlay, { phase: "edit" });
 * ```
 */
export type ValidationContext = {
  readonly phase?: string;
  readonly [key: string]: unknown;
};
