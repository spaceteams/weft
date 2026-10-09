---
"@spaceteams/weft": minor
---

`modelFingerprint` now covers the whole frozen model, and can be recomputed from frozen data alone

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