import type { Key, KeyId } from "../key";
import { type Rule, rule } from ".";

export type RoundMode = "round" | "floor" | "ceil" | "trunc";

export type RoundSpec = {
  op: "round";
  source: KeyId;
  mode: RoundMode;
  decimals: number;
};

export function round(
  target: Key<number>,
  source: Key<number>,
  options?: { mode?: RoundMode; decimals?: number },
): Rule<number> {
  const mode = options?.mode ?? "round";
  const decimals = options?.decimals ?? 0;
  const spec: RoundSpec = {
    op: "round",
    source: source.id,
    mode,
    decimals,
  };
  const factor = 10 ** decimals;
  return rule({
    target,
    spec,
    deps: [source],
    eval: (get) => {
      const v = get(source);
      const fn = Math[mode];
      const output = fn(v * factor) / factor;
      return { output, detail: { raw: v, mode, decimals } };
    },
  });
}
