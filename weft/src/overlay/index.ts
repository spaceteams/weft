import type { FactBag } from "../facts";
import type { KeyId } from "../key";

export type Overlay = Record<KeyId, unknown>;

export type OverlayedFacts = {
  readonly base: FactBag;
  readonly overlay: Overlay;
  readonly effective: FactBag;
};
