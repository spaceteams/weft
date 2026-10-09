# AGENTS.md — @spaceteams/weft

**weft** is a typed computation model library for overlay-based what-if analysis. You define a
graph of inputs and computed rules, then ask "what if we changed X?" via overlays. Models
compile and evaluate on the server, freeze into JSON-safe artifacts, and hydrate on the client
for analysis without round-trips.

Pipeline: keys/values/inputs → rules → `compileModel` → `evaluate` (+ layers) → overlays →
drafts → freeze → hydrate → inspect.

**Read before working:** `weft/README.md` (concepts, layers, validation),
`docs/rule-factories.md` (every factory and its spec op), `docs/validation-guide.md`,
`PLAN.md` (open work and open questions).

Skills in `.agents/skills/` encode the repetitive change recipes — `add-export`,
`frozen-artifact-migration`, `extend-evaluation-pipeline`, `extend-inspection-node`,
`write-weft-tests`, `lint-fix`, `validate`.

## Layers

Layers are parallel evaluation tracks that run alongside value computation. A layer reads a
rule's `spec.op`, its dependencies' layer values, and the rule's computed `output`, then
produces its own value for the target — or `undefined`, meaning "no value here" (sparse).
Register with `m.layer(evaluator)`; seed an input's value with `m.annotate(key, name, value)`.
Dispatch happens inside `evaluate`, after `rule.eval(get)`, and lands on the trace step as
`layerInputs` / `layerOutputs`.

Three things that are not readable off `src/layer.ts`:

- **`output` is `unknown` deliberately.** `CompiledModel.ruleByTarget` is a heterogeneous
  `ReadonlyMap<KeyId, Rule<unknown>>`, so the dispatch erased each rule's output type before
  any layer runs. Narrowing is the layer's job. The parameter is optional only so direct
  `layer.eval(op, deps, spec)` calls keep compiling.
- **`version` is load-bearing in two places.** Every layer declares one and it is written into
  `FrozenModel.layers[].version`, so a frozen artifact records which behaviour produced its
  values. It is also hashed into `modelFingerprint` via `snapshotFrozenModel`, so a bump moves
  the fingerprint — which is the point, since a value bag written by `units` v1 is not
  comparable to one written by v2. Bump it on any propagation semantics change. Note that
  nothing in the library *enforces* the comparison; the version is recorded evidence.
- **Layers are independent**, evaluated in registration order. A layer cannot read another
  layer's values (see PLAN.md Open Questions).

Shipped layers are separate workspace packages under `layers/`, not subpath exports. They
`import type` from the weft barrel, so their published bundles have no runtime dependency on
weft. Keep it that way.

## Traps

Each of these is invisible in the code and has cost debugging time.

- **Writing an optional key unconditionally into a trace detail breaks freezing.**
  `Object.entries` includes own keys whose value is `undefined`, and `canonicalize` rejects
  `undefined`. `match()` used to write `matchedRowLabel: row.label` unconditionally, which made
  every `switchOn` model unfreezable. Use `...(x !== undefined ? { x } : {})` for any optional
  detail field — and note `toEqual` will not catch it, since it ignores undefined-valued keys.
- **Author-supplied metadata can carry `undefined` into a frozen artifact.** `KeyMeta` is
  all-optional and `createModel` stores the author's object by reference, so
  `m.input(a, { label: config.title })` with a possibly-undefined `title` produces an own
  `label: undefined` key. `freezeModel` drops those before canonicalizing. `canonicalize`
  *throws* on `undefined` — it does not skip the key — so this is a hard freeze failure, and
  `toEqual` will not catch it in a test.
- **Every subpath is browser and edge safe; do not reintroduce `node:crypto`.** Fingerprinting
  used to import `node:crypto` at module scope, which made the root barrel, `./draft`, *and*
  `./snapshot` Node-only — not just the root barrel, which is what this file used to claim.
  `fingerprintValue` now hashes via `@noble/hashes`, byte-identical to `node:crypto`, so every
  entry point is clean. Do **not** fix a platform complaint by adding a `browser` export
  condition or a second `platform` build: `browser` is honoured by webpack/vite/rollup and not
  by Node SSR, so SSR would silently take a different build. For a *fingerprint* that is the
  same reproducibility hazard as hashing `fn.toString()` — a value that varies by bundler.
- **`migrateFrozenArtifact` does not validate; `parseFrozenArtifact` does.** Migration only
  inspects the `version` field. Always parse with the latter, or call
  `validateFrozenArtifact` explicitly.
- **Match row outputs are not static deps.** A dep-walker — including a layer — cannot see
  which row matched. This is why `dimensionalLayer`'s `match` op declines to propagate a unit.
- **`match()` with no matching row and no `default` throws in lenient mode too.** Lenient
  handles missing inputs and missing deps, not a failure inside a rule body.

## Design decisions

1. **`ModelStructure` is structurally typed** — `CompiledModel` satisfies it implicitly, so any
   new field on `ModelStructure` must be optional. The same field may be required on
   `CompiledModel`.
2. **Canonicalization is mandatory for frozen data** — everything in `FrozenModel` and
   `FrozenEvaluatedDraft` must be `CanonicalJson`. Canonicalization sorts keys, which is what
   makes fingerprints deterministic.
3. **No live functions cross the freeze boundary** — `Rule.eval`, `KeySemantics`, and
   `Resolver` never appear in frozen types. This is also why behaviour identity cannot come
   from `fn.toString()`; it must come from a declared `spec` or layer `version` string.
4. **Generic delta types preserve caller precision** — `explainDiffs<D>` and
   `groupDiffByOrigin<D>` return `Change<D>[]` / `DiffGroup<D>[]`, so a caller passing
   `CanonicalDelta[]` gets canonical types back.
5. **`normalizeDraft` is server-only** — it needs `CompiledModel` for semantics. The server
   normalizes before freezing, so clients skip it.
6. **A fingerprint is a pure function of the frozen model** — `snapshotFrozenModel` takes a
   `FrozenModel`, not a `CompiledModel`, so a client holding only frozen data can recompute it
   and a server cannot disagree with that client. `snapshotModel` is defined as
   `snapshotFrozenModel(freezeModel(model))`, not the reverse. It covers the whole frozen model,
   so `keyMeta`, dependency topology, layer names/versions/inputs, and validation metadata are
   all in scope. Behaviour implemented by functions that do *not* cross the freeze boundary is
   still out: rule `eval` bodies and `KeySemantics` `normalize` / `eq` / `encode` / `decode`.
   Those decide, respectively, the computed outputs, whether an overlay survives
   `normalizeDraft`, whether a delta is emitted, and the shape of every frozen value — and none
   appear in `FrozenModel`. So behaviour identity comes from `createModel({ version })` — the same
   declared-string contract as `LayerEvaluator.version`, and to be bumped for *any* of those
   callbacks, not just arithmetic. Nothing in the library *reads* any fingerprint field;
   recomputing them is the consumer's job. Before comparing two fingerprints, check
   `snapshot.fingerprintVersion` — **not** `version`. The hash input shape changed in v4, and a
   migration cannot recompute a digest it has no model for, so `migrateV3toV4` stamps the
   *previous* fingerprint version. `CURRENT_FROZEN_VERSION` is useless for this: migration makes
   every parsed artifact report the current value. See PLAN.md 8a for all three version axes.
7. **`keyValueTypes` is derived, not declared** — `freezeModel` infers it from the JSON Schema
   `type`; keys without schemas get `"unknown"`.
8. **Structural validation lives in `draft/freeze/`, value validation in `validate/`** —
   `validateFrozenArtifact` checks the envelope and canonicalizability; `validateFrozenDraft`
   checks values against schemas and needs a consumer-supplied `JsonSchemaValidator`.

## Recipes not covered by a skill

- **New rule factory** — add `src/rule/<name>.ts`, export it from `src/rules.ts` (the single
  source of truth for rule exports), and add an integration test in `examples/src/`.
- **New `ModelStructure` / `FrozenModel` field** — optional on `ModelStructure`, build it in
  `compileModel`, add it to the `FrozenModel` type plus `freezeModel`/`hydrateModel`, and
  canonicalize if it holds arbitrary data.
- **New layer** — `LayerEvaluator<T>` with `name` + `version`, register with `m.layer`, test in
  `examples/src/`, link from `examples/README.md`.
- **JSON Schema for a key** — auto-extracted from a Standard Schema V1 library's
  `~standard.jsonSchema`; otherwise set `jsonSchema` on `InputOptions`/`RuleOptions`, which also
  works metadata-only. Valibot does not implement the extension.

Conventions: kebab-case files, PascalCase types, `export type` at declaration site, co-located
tests. The library is side-effect-free, and declares `"sideEffects": false` in its `package.json`.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
