---
"@spaceteams/weft": minor
---

`LayerEvaluator.eval` now receives the rule's computed output

A layer used to be value-blind: `eval(op, deps, spec)` had no way to see the value its rule
produced, so a policy layer could not read the thing it was annotating. A currency-formatting
layer could not read the number; a provenance layer could not tell a literal from a derived
value. The computed `output` is now passed as a fourth argument:

```ts
const moneyLayer: LayerEvaluator<string> = {
  name: "money",
  version: "1",
  eval(_op, _deps, _spec, output) {
    if (typeof output !== "number") return undefined;
    return output.toLocaleString("en-US", { style: "currency", currency: "USD" });
  },
};
```

`default(deps, output)` receives it too.

**`output` is typed `unknown`, and that is deliberate.** `CompiledModel.ruleByTarget` is a
heterogeneous `ReadonlyMap<KeyId, Rule<unknown>>`, so by the time the evaluation loop reaches a
layer the rule's own output type has already been erased. No signature change can narrow it
without reworking the dispatch to preserve per-rule types. The win is that the information is
now *available*; narrowing is the layer's job.

**This is not a breaking change for layer authors or for direct callers.** A function with
fewer parameters is always assignable to a signature with more, so layers written against the
previous signatures still typecheck — including `eval()` declaring no parameters at all, and an
implementation that declares `output` as a required parameter. All three shipped layers compile
unchanged and behave identically. `output` is optional rather than required specifically so that
a direct three-argument `layer.eval(op, deps, spec)` keeps compiling; since `unknown` already
includes `undefined`, an implementation sees the same `unknown` either way.

No frozen artifact version bump: layer outputs were already frozen
(`canonicalizeLayerValues`, `CanonicalTraceStep.layerOutputs`), and no serialized shape changed.

The positional signature is deliberate for now. Once a *second* context field is needed — a
matched-row id, or the full layer map so a layer can resolve a value that is not a dependency —
the arguments should become a single context object. Recording that here so the migration is
not rediscovered from scratch.
