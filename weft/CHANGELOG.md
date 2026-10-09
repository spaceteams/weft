# @spaceteams/weft

## 0.8.0

### Minor Changes

- 8cb192e: `modelFingerprint` now covers the whole frozen model, and can be recomputed from frozen data alone
  
  **The fingerprint is a pure function of `FrozenModel`.** `snapshotFrozenModel(frozen)` is the new
  primary entry point, and `snapshotModel(model)` is now defined as
  `snapshotFrozenModel(freezeModel(model))` — so a server and a client derive the same value by
  construction.
  
  Two consequences:
  
  - **The coverage gap is closed.** `modelFingerprint` and `analysisFingerprint` previously hashed
    only `{ inputKeys, rules: [{ target, spec }] }`. They now cover `version`, `keyMeta`,
    `depsByTarget`, `dependentsByKey`, `orderedRuleTargets`, `jsonSchemas`, `keyValueTypes`,
    `constraints`, and each layer's `name`, `version`, and `inputs`. Layer `inputs` are included
    because `evaluate` seeds each layer's value map from them — two models differing only in
    `m.annotate` values produce different layer outputs and must not fingerprint alike.
    Verified: a changed key label, a changed ops descriptor, a changed literal, added inputs, a
    changed dependency topology, a layer version bump, a changed layer annotation, and a removed
    layer all now produce different fingerprints.
  - **A client can recompute it.** `snapshotModel` took a `CompiledModel`, which requires live
    `Rule.eval`, so no client could call it — the field was write-only in practice. This is the
    flow that was previously impossible:
  
    ```ts
    const parsed = parseFrozenArtifact(frozenDraftJson);
    fingerprintValue(snapshotFrozenModel(frozenModelJson)) === parsed.snapshot.modelFingerprint;
    ```
  
    Note that `snapshotModel` was already exported; exporting it was never the blocker.
  
  Behaviour implemented by functions that do not cross the freeze boundary remains uncovered. That is
  not only rule arithmetic in `eval` bodies but also `KeySemantics` callbacks: `normalize` decides
  whether an overlay survives `normalizeDraft`, `eq` decides whether a delta is emitted at all, and
  `encode` decides the shape of every frozen value. Verified — two models differing only in these
  callbacks produce an identical `modelFingerprint` while producing different drafts and frozen
  values.
  
  Hashing `fn.toString()` was rejected — closure capture is invisible (`ratio`'s body reads
  `ops.div(a, b)` and never names `ops`, so every algebra hashes identically; ~14 of 30 factories
  are ops-aware) and minified output varies by bundler. Instead, behaviour identity is declared, and
  `version` must be bumped for **any** such change, not only arithmetic:
  
  ```ts
  const m = createModel({ version: "2" });   // bump after the tax rounding fix
  ```
  
  `createModel` previously took no arguments. `version` is optional, flows through `Model`,
  `CompiledModel`, and `FrozenModel`, and is hashed into the fingerprint. Same contract as
  `LayerEvaluator.version`: nothing enforces that you bump it.
  
  **Breaking, in effect:** the hash input shape changed, so a fingerprint written by an older
  version of weft will not reproduce. `CURRENT_FROZEN_VERSION` is bumped to 4 for this reason.
  Nothing is lost — the fingerprints were never read by anything, in weft or downstream.
  
  `baseFingerprint` and `overlayFingerprint` are unaffected: same input shape, same digest.
  
  **`snapshot.fingerprintVersion` is new, and it is the field to compare — not the artifact
  `version`.** A migration cannot recompute a fingerprint, because a fingerprint depends on the
  model and the migration is never handed one. So a v3 artifact's digests stay v3-shaped after
  migration, and `migrateV3toV4` records the *previous* fingerprint version rather than relabelling
  it. This matters because `parseFrozenArtifact` migrates unconditionally: without the new field a
  migrated artifact would be indistinguishable from a natively frozen one, even though recomputing
  its `modelFingerprint` cannot match.
  
  ```ts
  if (a.snapshot.fingerprintVersion === b.snapshot.fingerprintVersion) {
    // Only now are modelFingerprint / analysisFingerprint values comparable.
  }
  ```
  
  `CURRENT_FROZEN_VERSION` cannot serve this purpose — migration makes every parsed artifact report
  the current value, whatever its origin. Bump `CURRENT_FINGERPRINT_VERSION` whenever
  `snapshotFrozenModel` changes what it covers.
  
  **Fixes**
  
  - `freezeModel` no longer produces an unfreezable model when a key's metadata holds an
    explicit `undefined`. `KeyMeta` is all-optional and `createModel` stores the author's object by
    reference, so `m.input(a, { label: config.title })` with a possibly-undefined `title` carried an
    own `label: undefined` key, which `canonicalize` rejects. This was latent — nothing hashed
    `keyMeta` until now — and `toEqual` will not catch it, since it ignores undefined-valued keys.
  - Every subpath is now browser- and edge-safe. `fingerprintValue` used to import `node:crypto` at
    module scope, which made the root barrel, `./draft`, **and** `./snapshot` Node-only. It now
    hashes via `@noble/hashes`, byte-identical to `node:crypto`, so stored fingerprints stay
    verifiable and there is no platform-conditional build. This adds weft's first bundled runtime
    dependency.
  - Declared `"sideEffects": false` on weft and the three layer packages.
  
  **Rejected: a `browser` export condition or a second `platform` build.** `browser` is honoured by
  webpack/vite/rollup and not by Node SSR, so SSR would silently take a different build — for a
  fingerprint that is the same reproducibility hazard as hashing `fn.toString()`.

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
