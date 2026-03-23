import { defaultEvaluateMode, type EvaluateMode, evaluate } from "../evaluate";
import type { EvaluationResult } from "../evaluate/evaluation-result";
import type { FactBag } from "../facts";
import type { KeyId } from "../key";
import type { CompiledModel } from "../model";
import type { Overlay, OverlayedFacts } from ".";
import { applyOverlay } from "./apply-overlay";

export type ValueOrigin =
  | { readonly kind: "base" }
  | { readonly kind: "overlay" }
  | { readonly kind: "derived" };
export type OriginMap = ReadonlyMap<KeyId, ValueOrigin>;

export type OverlayEvaluationResult = EvaluationResult & {
  readonly overlayedFacts: OverlayedFacts;
  readonly origins: OriginMap;
};

export function evaluateOverlay(
  model: CompiledModel,
  base: FactBag,
  overlay: Overlay,
  mode: EvaluateMode = defaultEvaluateMode,
): OverlayEvaluationResult {
  const facts = applyOverlay(base, overlay);
  const evaluated = evaluate(model, facts.effective, mode);

  const origins = new Map<string, ValueOrigin>();

  for (const input of model.inputs) {
    const key = input.key.id;
    if (key in overlay) {
      origins.set(key, { kind: "overlay" });
    } else if (key in base) {
      origins.set(key, { kind: "base" });
    }
  }

  for (const rule of model.rules) {
    origins.set(rule.target.id, { kind: "derived" });
  }

  return {
    ...evaluated,
    overlayedFacts: facts,
    origins,
  };
}
