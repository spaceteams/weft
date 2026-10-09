# PLAN.md — Evaluation Layers

## Motivation

Each key in a weft model used to hold a single value: the computation result. Metadata like
`unit` and `semanticType` were static presentation hints that didn't participate in evaluation,
but real-world use cases need **behavioral** metadata — units that propagate through
computations, provenance that tracks origins, constraints that validate dimensional
consistency.

These aren't metadata in the traditional sense. They're parallel evaluation tracks that run
alongside the computation layer. Weft provides the **machinery** without opinionating on the
content.

**Status: shipped.** Layers landed in 0.5.0 and the `unit`/`semanticType` fields were removed
from `KeyMeta`. For the arc of what shipped, see `weft/CHANGELOG.md`. This file now records
only what is *not* done, plus the reasoning behind those decisions.

## Design Principles

These still constrain the open questions below.

1. **Runtime-first** — propagation happens during evaluation, not at compile time. Avoids
   type-level burden while the library evolves.
2. **Decoupled from rules** — layers interpret `spec.op`; rule factories don't know about
   layers. They meet at the spec.
3. **Sparse** — not every key needs every layer. Layers handle what they know and leave the
   rest undefined.
4. **User-defined** — applications define their own layers; weft provides canonical
   implementations for common patterns.
5. **Freezable** — layer values freeze alongside values so clients can inspect them without
   re-evaluation.
6. **Versioned** — each layer declares `name` + `version` so frozen artifacts remain
   interpretable as layer logic evolves.

The shipped implementation is `src/layer.ts` (contract), `src/evaluate/index.ts` (dispatch),
and `src/model/freeze-model.ts` (artifact shape).

---

## Open work

### 7c. Error boundary in evaluation

If a single rule's `eval()` throws, the entire evaluation aborts. `match()` with no matching
row and no `default` is the reachable case. Lenient mode does **not** help — it covers missing
inputs and missing deps, not failures inside a rule body.

The obvious fix is per-key error capture (`EvaluationResult.errors`), propagating to dependents
via the existing `missingDeps` path, which is cheap. **We are leaning against adding it.**
weft already models a domain outcome with no value as a *value* — `match`'s `default` branch,
`conditional`'s otherwise-branch. A second, weaker "this key has no value" channel competes
with the value-based path. A consumer that needs to distinguish "missing because the user
didn't supply it" from "missing because the rule threw" should handle it at their own step
boundary.

Revisit only if a consumer genuinely needs weft to make that distinction.

### 7d. Rule spec discriminated union

Specs are typed `Record<string, unknown>` structurally. Each factory has its own type
(`SumSpec`, `RatioSpec`, …) but they're never gathered into a union, so layer and inspection
dispatch on `spec.op` with zero narrowing. A `RuleSpec` union — possibly open-ended via module
augmentation — would give exhaustive switch checking.

### 7e. Layer annotation type safety

`m.annotate(key, "units", value)` accepts `unknown`, so wrong types and swapped layer names go
unchecked. Passing the layer instance instead would let TypeScript infer and check.

### 7f. Inspection builder consolidation

`inspectModelTarget`, `inspectTraceTarget`, and `inspectDiffTarget` each independently
reimplement dep-walking, label resolution, and kind resolution. Only the decoration (values,
deltas, layers) differs. A shared tree builder with a decoration strategy would shrink the
maintenance surface.

### 7g. Canonicalization validation fence

**Partially done.** Canonicalization failures now name the offending field — `canonicalize`
derives the full location during recursion, so a failure reads
`Unsupported value for canonicalization: undefined (at values.total)` rather than giving no
positional context. `validateFrozenArtifact` also runs a canonicalizability pass over a whole
parsed artifact.

**Still open: silent data loss.** `Set`, `Map`, and `RegExp` are plain `typeof "object"`, so
they fall through to the object branch and canonicalize to `{}` instead of throwing. That is
worse than a throw — it loses data *and* makes distinct values collide under fingerprinting.
Only `Date` is special-cased. A test in `snapshot/canonicalize.test.ts` pins the current
behaviour so it cannot change unnoticed.

Related, and now fixed: `KeyMeta` was a live instance of the *undefined*-in-own-keys half of this
problem. `KeyMeta` is all-optional and `createModel` stored the author's object by reference, so
`m.input(a, { label: config.title })` with a possibly-undefined `title` produced an own
`label: undefined` key, which `canonicalize` rejects — an unfreezable model. Nothing hashed
`keyMeta` before, so it was latent; `freezeModel` now drops undefined-valued metadata before
canonicalizing. Note the general shape: `canonicalize` throws on `undefined`, it does not skip
the key, and `toEqual` will not catch an undefined-valued own key in a test.

---

## Verified findings

Established by reading source **and** by probing `dist/`. Recorded so they are not
rediscovered at the wrong size.

### 8a. Fingerprint coverage was much narrower than it looked — **fixed in 0.8.0**

*Original finding, kept because the reasoning still applies.* `snapshotModel`
(`src/model/snapshot-model.ts`) — the sole input to `modelFingerprint` and `analysisFingerprint` —
returned only `{ inputKeys, rules: [{ target, spec }] }`, a strict subset of `FrozenModel`.
Verified: `modelFingerprint` was **identical** across models differing in eval body, in a key's
`label`, and in rule dependency order. Drift in `keyMeta`, dependency topology,
`orderedRuleTargets`, `jsonSchemas`, `keyValueTypes`, `constraints`, and layers was all invisible.

**Resolved by making the fingerprint a pure function of the frozen model.** `snapshotFrozenModel`
takes a `FrozenModel` — which carries every one of those fields — and `snapshotModel` is now
defined as `snapshotFrozenModel(freezeModel(model))`. Keying off the frozen form rather than
`CompiledModel.rules` is what closed the gap, and it also means a client can recompute a
fingerprint from the two JSON artifacts it was shipped: previously it could not, because
`CompiledModel` requires live `Rule.eval`. Live function behaviour remains the uncovered axis — rule
arithmetic *and* `KeySemantics` `normalize` / `eq` / `encode`, which decide whether an overlay
survives, whether a delta is emitted, and the shape of every frozen value. `createModel({ version })`
is the supported channel for all of them — hashed alongside each layer's `name` + `version`.

**Rejected: hashing `fn.toString()`.** Still the right answer. Two reasons, the first fatal:

1. *Closure capture is invisible.* Ops-aware factories close over `ops`, so `ratio`'s eval body
   reads `ops.div(a, b)` and never mentions `ops` — every algebra hashes identically. You'd
   fingerprint the wrapper, not the behaviour. That's ~14 of 30 factories.
2. *Build-tool instability.* Minification renames identifiers and rewrites bodies; two builds of
   one commit can differ. Since `analysisFingerprint` lives inside the artifact, you could no
   longer diff two artifacts from two builds of the same commit.

The same reasoning rules out a `browser` export condition for the hash: `browser` is honoured
by webpack/vite/rollup and not by Node SSR, so SSR would silently take a different build — a
fingerprint that varies by bundler is precisely the hazard above. Hence `@noble/hashes` and a
byte-identical digest in every environment instead.

**Still open, and unchanged by the above:**

- The fingerprints remain **write-only**. Nothing in the library reads them; `analyzeFrozenDraft`
  never touches `draft.snapshot`; there is no drift-detection API. A consumer deciding whether two
  artifacts are comparable is still an unbuilt feature. Recompute is now *possible*, which was the
  precondition, not the feature.
- `baseFingerprint`/`overlayFingerprint` hash the *raw* `draft.base`/`overlay` while the adjacent
  emitted `base`/`overlay` hash the *canonicalized* forms — two serializations of one logical
  value in a single artifact.
- A v3 artifact's `modelFingerprint` is **not reproducible** by v4 code and cannot be migrated: the
  hash input shape changed, and a fingerprint depends on the *model*, which the migration is never
  handed. `snapshot.fingerprintVersion` is the axis for detecting this — the artifact `version` is
  useless for it, since `parseFrozenArtifact` migrates unconditionally and so reports
  `CURRENT_FROZEN_VERSION` for a migrated artifact too. `migrateV3toV4` therefore stamps the
  *previous* fingerprint version rather than the current one. `baseFingerprint` and
  `overlayFingerprint` are unaffected: they hash `draft.base`/`draft.overlay`, not the model.
- `FrozenModel` still has **no independent artifact schema version**, and `hydrateModel` still has no
  validate or migrate path — so the migration skill's instruction to bump the version for a
  `FrozenModel` change remains unenforceable for models. `CURRENT_FROZEN_VERSION` governs
  `FrozenEvaluatedDraft` alone. The new `FrozenModel.version` is author-declared *behaviour*
  identity, not a schema version.
- Layer `version` is still recorded but never **compared** by anything. A `units` v1 bag and a
  `units` v2 bag are indistinguishable to a consumer that does not check versions itself. (Their
  models do fingerprint differently, so drift is detectable — just not at the value-bag level.)

### Three version axes, deliberately named similarly

This change introduced a third. They are distinct questions, and conflating them is the trap:

| Field | Answers | Changed by |
| --- | --- | --- |
| `FrozenModel.version` | Which *author-declared behaviour revision* produced this model | author, when arithmetic or `KeySemantics` callbacks change |
| `snapshot.fingerprintVersion` | Which `snapshotFrozenModel` projection produced these digests | library, when the projection's coverage changes |
| `CURRENT_FROZEN_VERSION` | Which *artifact schema* this blob conforms to | library, when a field is added or removed |

`CURRENT_FROZEN_VERSION` is the one to be careful with: migration makes every parsed artifact report
the current value, so it can never answer "were these two artifacts fingerprinted the same way?"

### 8b. `match()` with no matching row and no default throws in both modes

Verified in strict **and** lenient — the failure is inside the rule body, after the dep guard.
Covered by 7c above.

### 8c. `LayerEvaluator` args should become a context object

`eval(op, deps, spec, output)` is source-compatible but positional arguments age poorly. Once a
*second* context field is needed — a matched-row id, or the full layer map so a layer can
resolve a value that isn't one of its deps — collapse them into one object. That is also the
better expression of "spec is the only shared contract".

### 8d. `provenance.default` is unreachable

`provenanceLayer.eval` calls `derived(deps)`, which always returns an object and never
`undefined`. Dispatch only falls back to `default` when `eval` returns `undefined`, so
`provenanceLayer.default` can never run. Drop it or give it a reason to exist.

---

## Open Questions

- **Layer evaluation errors**: If a layer's `eval` throws (e.g. incompatible units in a sum),
  hard error or collected diagnostic? Leaning diagnostic — don't block computation for a layer
  failure.
- **Cross-layer interaction**: Can one layer read another's values? (e.g. a "formatted display"
  layer reading both computation and units to produce "$50/hr"). Probably yes, with explicit
  dependency declaration. Distinct from reading one's *own* deps plus the computed `output`,
  which layers can already do.
- **Overlay layer semantics**: When an overlay changes an input, do layer input annotations get
  overlayed too? Probably yes — an overlay might say "use centimeters instead of meters".
- **Layer ordering**: If layers can depend on each other they need topological ordering too. For
  v1, independent layers in registration order is sufficient.