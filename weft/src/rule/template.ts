import type { AnyKey, Key, KeyId } from "../key";
import { type Rule, rule } from ".";

export type TemplateSpec = {
  op: "template";
  pattern: string;
  deps: Record<string, KeyId>;
};

export function template<T extends Record<string, Key<unknown>>>(
  target: Key<string>,
  pattern: string,
  deps: T,
): Rule<string> {
  const entries = Object.entries(deps) as [string, AnyKey][];
  const spec: TemplateSpec = {
    op: "template",
    pattern,
    deps: Object.fromEntries(entries.map(([k, v]) => [k, v.id])),
  };
  const depKeys: AnyKey[] = entries.map(([, v]) => v);
  return rule({
    target,
    spec,
    deps: depKeys,
    eval: (get) => {
      let output = pattern;
      for (const [name, k] of entries) {
        output = output.replaceAll(`{${name}}`, String(get(k)));
      }
      return { output };
    },
  });
}
