# @spaceteams/weft

## 0.7.0

### Minor Changes

- 4b09017: `LayerEvaluator.eval` now receives the rule's computed output
  
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
- 4b09017: `parseFrozenArtifact` now validates the artifact's structure
  
  `parseFrozenArtifact` migrated the artifact and then returned it via an unchecked cast
  (`parse.ts`). `migrateFrozenArtifact` only inspects the `version` field, so an artifact that
  claimed the current version but was otherwise malformed — a missing `trace`, a `deltas` array
  of strings, a `Date` in `values` — migrated "successfully" and was handed back typed as a
  `FrozenEvaluatedDraft`. The failure then surfaced far from its cause, in whatever downstream
  code first touched the bad field.
  
  For a library whose stated purpose is reading artifacts across process boundaries and deploys,
  that is the wrong failure mode. Validation now runs after migration and throws:
  
  ```
  Frozen artifact is malformed:
  - trace: expected an array, got undefined
  - draftId: expected a string, got undefined
  ```
  
  Every problem is reported in one message rather than failing on the first, so a single round
  trip surfaces all of them.
  
  New exports:
  
  - `validateFrozenArtifact(artifact)` returns `string[]` — empty when well formed. Use it to
    decide whether a cached copy should be re-fetched, without throwing.
  - `frozenArtifactErrorMessage(problems)` formats the throwable message.
  
  Canonicalizability is part of validation, so `undefined`, circular references, and other
  non-serializable content are caught — and the error names the offending path, e.g.
  `Unsupported value for canonicalization: undefined (at values.total)`.
  
  This is a behaviour change for anyone currently round-tripping a subtly malformed artifact:
  they will now get an exception rather than a confusing downstream crash. That is the intent.
  `migrateFrozenArtifact` remains exported and unvalidated for callers who genuinely want the raw
  migrated shape.
  
  No frozen artifact version bump — nothing about the serialized shape changed.

### Patch Changes

- 4b09017: Fix `match()` emitting `undefined` into trace detail, which made label-less match rows impossible to freeze
  
  `match()` wrote `matchedRowLabel: row.label` unconditionally, producing an own property
  whose value was `undefined` when the row had no label. `canonicalizeTraceStep` iterates
  `Object.entries(detail)` — which includes `undefined`-valued keys — and `canonicalize()`
  rejects `undefined`, so `freezeEvaluatedDraft` threw
  `Unsupported value for canonicalization: undefined`.
  
  This was not hypothetical: `switchOn()` builds its rows without labels in both the
  record-form and array-form case shapes, so **every model using `switchOn` failed to
  freeze**. Only evaluation and inspection were affected, which is why it went unnoticed —
  `inspection-node-to-ascii` uses `??` and fell back to `matchedRowId`, and
  `examples/src/tarifierung.test.ts` uses label-less match rows but never freezes.
  
  `match()` now omits the property when there is no label, mirroring what `matchToSpec`
  already did on the spec path. `matchedRowLabel` remains optional on `MatchTraceDetail`.
  No frozen artifact version bump: label-less matches could not freeze at all before, so no
  existing artifact carries the field.
  
  Canonicalization failures also now name the offending location. `canonicalize` takes an
  optional `path` that is threaded through the recursion and appended to the error message,
  so a failure reads `Unsupported value for canonicalization: undefined (at trace.out.detail.mode)`
  instead of giving no positional context at all. The call sites that freeze artifacts label
  their paths (`base.*`, `overlay.*`, `effective.*`, `values.*`, `deltas.*`, `layers.*`,
  `trace.<target>.*`). The added parameter is optional, so this is not a breaking change.

## 0.6.0

### Minor Changes

- 5e6865c: rule improvements and better examples

## 0.5.0

### Minor Changes

- 1e4bb46: many new rules and decision dsl
- 1e4bb46: introduce layers and strip keymeta
- 1e4bb46: validation capabilities

### Patch Changes

- 1e4bb46: add analyze frozen draft helper

## 0.4.0

### Minor Changes

- 47fac84: many new rules and decision dsl
- 47fac84: validation capabilities

### Patch Changes

- 47fac84: add analyze frozen draft helper

## 0.3.0

### Minor Changes

- c9c71c6: validation capabilities

### Patch Changes

- c9c71c6: add analyze frozen draft helper

## 0.2.2

### Patch Changes

- 8d15565: add analyze frozen draft helper

## 0.2.1

### Patch Changes

- 1c543ae: add analyze frozen draft helper

## 0.2.0

### Minor Changes

- 759a908: better api surface and frozen artifacts

## 0.1.0

### Minor Changes

- 98c42db: better api surface and frozen artifacts

## 0.0.1

### Patch Changes

- 2bee10a: initial release
