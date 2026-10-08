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

---

## Verified findings

Established by reading source **and** by probing `dist/`. Recorded so they are not
rediscovered at the wrong size.

### 8a. Fingerprint coverage is much narrower than it looks

`snapshotModel` (`src/model/snapshot-model.ts`) — the sole input to `modelFingerprint` and
`analysisFingerprint` — returns only `{ inputKeys, rules: [{ target, spec }] }`, a strict subset
of `FrozenModel`. Verified: `modelFingerprint` is **identical** across models differing in eval
body, in a key's `label`, and in rule dependency order. Drift in `keyMeta`, dependency
topology, `orderedRuleTargets`, `jsonSchemas`, `keyValueTypes`, `constraints`, and layers is all
invisible to it.

Two related problems: the fingerprints are **write-only** (nothing reads them; `analyzeFrozenDraft`
never touches `draft.snapshot`; there is no drift-detection API), and
`baseFingerprint`/`overlayFingerprint` hash the *raw* `draft.base`/`overlay` while the adjacent
emitted `base`/`overlay` hash the *canonicalized* forms — two serializations of one logical
value in a single artifact.

**Rejected: hashing `fn.toString()`.** Two reasons, the first fatal:

1. *Closure capture is invisible.* Ops-aware factories close over `ops`, so `ratio`'s eval body
   reads `ops.div(a, b)` and never mentions `ops` — every algebra hashes identically. You'd
   fingerprint the wrapper, not the behaviour. That's ~14 of 30 factories.
2. *Build-tool instability.* Minification renames identifiers and rewrites bodies; two builds of
   one commit can differ. Since `analysisFingerprint` lives inside the artifact, you could no
   longer diff two artifacts from two builds of the same commit.

The right home for behaviour identity is a declared string, which is why `LayerEvaluator.version`
is required. Extending that to rule semantics (an author-supplied version in `spec`) is
plausible but opt-in and adds author burden, so it needs a design decision rather than a fix.

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