import type { FactBag } from "../facts";
import type { Overlay, OverlayedFacts } from ".";

export function applyOverlay(base: FactBag, overlay: Overlay): OverlayedFacts {
  return {
    base,
    overlay,
    effective: {
      ...base,
      ...overlay,
    },
  };
}
