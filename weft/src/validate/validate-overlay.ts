import type { KeyId } from "../key";
import type { MaybeAsync } from "../maybe-async";
import type { CompiledModel } from "../model";
import type { Overlay } from "../overlay";
import { validateRecord } from "./validate-facts";
import type { ValidationContext } from "./validation-context";
import type { ValidationResult } from "./validation-result";

/**
 * Validates values in `overlay` against their declared schemas.
 * Only validates keys present in the overlay (partial validation).
 * Keys without schemas are skipped.
 *
 * This is the hot path for spreadsheet-like UIs that validate on every cell edit.
 */
export function validateOverlay(
  model: CompiledModel,
  overlay: Overlay,
  context?: ValidationContext,
): MaybeAsync<ValidationResult> {
  const overlayKeys: KeyId[] = Object.keys(overlay);
  return validateRecord(model, overlay, overlayKeys, context);
}
