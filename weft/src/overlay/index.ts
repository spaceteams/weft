import type { FactBag } from "../facts";
import type { KeyId } from "../key";

export type Overlay = Record<KeyId, unknown>;

export type OverlayedFacts = {
  readonly base: FactBag;
  readonly overlay: Overlay;
  readonly effective: FactBag;
};

export * from "./apply-overlay";
export * from "./diff-group";
export * from "./diff-results";
export * from "./evaluate-overlay";
export * from "./explain-diff";
