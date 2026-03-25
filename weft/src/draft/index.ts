import type { FactBag } from "../facts";
import type { Overlay } from "../overlay";
import type { DraftMeta } from "./draft-meta";

export type DraftId = string;

export type Draft = {
  readonly draftId: DraftId;
  readonly base: FactBag;
  readonly overlay: Overlay;
  readonly meta?: DraftMeta;
};

export function createDraft(draftId: DraftId, base: FactBag, overlay: Overlay): Draft {
  return { draftId, base, overlay };
}
