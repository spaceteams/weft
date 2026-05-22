# AGENTS.md — @spaceteams/weft

## Project Overview

**weft** is a typed computation model library for overlay-based what-if analysis. It lets you define a graph of inputs and computed rules, then explore "what if we changed X?" scenarios via overlays. The library is designed for a server/client split: models are compiled and evaluated on the server, then frozen into JSON-safe artifacts that clients can hydrate and analyze without round-trips.

Published as `@spaceteams/weft` on npm.

## Repository Structure

This is a **pnpm monorepo** managed by Turborepo:

```
weft/                     ← repo root
├── weft/                 ← main library package (@spaceteams/weft)
│   ├── src/
│   │   ├── index.ts          ← main entry (re-exports everything)
│   │   ├── core.ts           ← subpath: keys, values, inputs, facts, semantics
│   │   ├── rules.ts          ← subpath: rule definitions and factories
│   │   ├── model/            ← model building, compilation, graphs, freeze/hydrate
│   │   ├── evaluate/         ← pure evaluation engine
│   │   ├── overlay/          ← overlay evaluation, diffing, grouping, explanation
│   │   ├── draft/            ← draft lifecycle, analysis, freeze/parse/migrate
│   │   ├── inspect/          ← inspection trees and ASCII rendering
│   │   ├── snapshot/         ← canonical serialization and fingerprinting
│   │   └── semantics/        ← algebra, codec, formatter types
│   ├── dist/                 ← build output (tsdown)
│   ├── tsdown.config.ts
│   ├── tsconfig.json
│   └── package.json
├── examples/             ← integration tests using the published API
│   └── src/*.test.ts
├── biome.json            ← linter + formatter config
├── turbo.json            ← task pipeline
├── pnpm-workspace.yaml
└── package.json          ← root scripts
```

## Commands

All commands run from the **repo root** (`weft/`):

| Task | Command | Notes |
|------|---------|-------|
| Build all | `pnpm build` | Runs turbo → tsdown |
| Typecheck all | `pnpm typecheck` | `tsc --noEmit` in each package |
| Test all | `pnpm test` | `vitest run` in each package |
| Lint | `pnpm lint` | Biome check |
| Lint fix | `pnpm lint:fix` | Biome auto-fix |
| Format | `pnpm format` | Biome format |
| Full CI check | `pnpm check` | test + lint + format:check + typecheck + build |

For the **library package only** (from `weft/weft/`):

| Task | Command |
|------|---------|
| Build | `pnpm run build` |
| Typecheck | `pnpm run typecheck` |
| Test | `pnpm run test` |
| Test (watch) | `pnpm run test:watch` |
| Lint | `pnpm run lint` |
| Format | `pnpm run format` |

## Toolchain

- **Package manager**: pnpm 10
- **Bundler**: tsdown (rolldown-based, ESM output)
- **TypeScript**: 5.9 with `strict`, `verbatimModuleSyntax`, `noUnusedLocals`
- **Test runner**: Vitest 4
- **Linter/Formatter**: Biome 2.4
- **Monorepo orchestration**: Turborepo

## Code Style

- 2-space indent, double quotes, trailing commas, semicolons, LF line endings
- Max line width: 100
- Use `import type` for type-only imports (`"useImportType": "error"`)
- Use `node:` protocol for Node.js builtins (`"useNodejsImportProtocol": "error"`)
- No unused variables/imports (errors)
- `noNonNullAssertion` is allowed (off)
- Tests may use `any` without warning

## Architecture & Key Concepts

### API Layers (bottom to top)

```
Core       → Keys, Values, Inputs, Facts, Semantics
Rules      → Sum, Ratio, Scale, WeightedSum, Projection, Decision
Model      → createModel → compileModel → CompiledModel
Evaluate   → evaluate(model, facts) → EvaluationResult
Overlay    → evaluateOverlay, diffResults, groupDiffByOrigin, explainDiffs
Draft      → createDraft → normalizeDraft → evaluateDraft → analyzeDraft
Inspect    → inspectModelTarget, inspectTraceTarget, inspectDiffTarget
Snapshot   → canonicalize, fingerprint
```

### Core Types

| Type | Purpose |
|------|---------|
| `Key<T>` | Typed identifier for a value in the model |
| `KeyId` | String alias (`Key<T>.id`) |
| `FactBag` | `Record<KeyId, unknown>` — input values |
| `Overlay` | `Record<KeyId, unknown>` — proposed overrides |
| `Input<T>` | Declaration of an input key |
| `Rule<T>` | Computation node: target + deps + eval function + spec |
| `Model` | Uncompiled model (inputs + rules + semantics + metadata) |
| `CompiledModel` | Validated model with dependency graph, topological order, `ruleSpecs` |
| `ModelStructure` | Structural subset of `CompiledModel` (no live rule fns); satisfied by both `CompiledModel` and hydrated frozen models |

### Evaluation & Overlay

| Type | Purpose |
|------|---------|
| `EvaluationResult` | `{ values, missing, order, trace }` |
| `TraceStep` | Per-rule trace: target, deps, inputs, output, ruleSpec, detail |
| `OverlayEvaluationResult` | Evaluation + `overlayedFacts` + `origins` |
| `ValueOrigin` | `"base"` / `"overlay"` / `"derived"` |
| `OriginMap` | `Map<KeyId, ValueOrigin>` |
| `ValueDelta` | Discriminated union: added / removed / changed |

### Draft Lifecycle

```
createDraft(id, base, overlay)         → Draft
normalizeDraft(model, draft)           → NormalizedDraft + issues
evaluateDraft(model, draft, mode)      → EvaluatedDraft
analyzeImpact(model, origins, deltas)  → ImpactAnalysis
analyzeDraft(model, draft, mode)       → DraftAnalysis (full)
```

### Freeze / Hydrate (Server → Client)

**Server-side freeze:**
```
freezeModel(compiledModel)                → FrozenModel (JSON-safe)
freezeEvaluatedDraft(model, evaluated)    → FrozenEvaluatedDraft (JSON-safe)
```

**Client-side hydrate & analyze:**
```
hydrateModel(frozenModel)                 → ModelStructure
analyzeFrozenDraft(frozenModel, frozenDraft) → ClientDraftAnalysis
```

The convenience function `analyzeFrozenDraft` chains:
`hydrateModel` → `deriveOrigins` → `analyzeImpact` + `groupDiffByOrigin` + `explainDiffs`

### Canonical Serialization

| Type | Purpose |
|------|---------|
| `CanonicalJson` | `null \| boolean \| number \| string \| CanonicalJson[] \| Record<string, CanonicalJson>` |
| `CanonicalDelta` | `ValueDelta` with `CanonicalJson` values (structurally assignable to `ValueDelta`) |
| `CanonicalTraceStep` | `TraceStep` with `CanonicalJson` values (structurally assignable to `TraceStep`) |

Canonicalization sorts object keys and normalizes values for deterministic fingerprinting.

### Frozen Artifact Types

| Type | Contents |
|------|----------|
| `FrozenModel` | `inputKeys`, `orderedRuleTargets`, `depsByTarget`, `dependentsByKey`, `keyMeta`, `ruleMeta`, `ruleSpecs` (all as Records, canonicalized) |
| `FrozenEvaluatedDraft` | `version`, `draftId`, `snapshot`, `base`, `overlay`, `effective`, `values`, `deltas`, `trace`, `frozenAt` |
| `FrozenSnapshot` | Fingerprints: `modelFingerprint`, `baseFingerprint`, `overlayFingerprint`, `analysisFingerprint`, `createdAt` |
| `ClientDraftAnalysis` | `impact`, `groupedDiffs`, `changes`, `values` — derived client-side from frozen artifacts |

### Frozen Artifact Versioning & Migration

Frozen artifacts carry a `version` field (current: `CURRENT_FROZEN_VERSION = 1`). The `parseFrozenArtifact(json)` function auto-migrates from any older version. Migrations live in `draft/freeze/migrations/`.

### Inspection

Three inspection entry points build `InspectionNode` trees:
- `inspectModelTarget(model, target)` — static dependency structure (accepts `ModelStructure`)
- `inspectTraceTarget(model, trace, target)` — runtime values from evaluation trace
- `inspectDiffTarget(model, result, changes, target)` — values + change annotations

All accept `ModelStructure` (works with both live and hydrated frozen models). Render with `inspectionNodeToAscii(node, { showMeta, showChange })`.

### Type Compatibility: Canonical ↔ Live

Analysis functions use generic/widened signatures so frozen canonical data flows in without casts:

- `analyzeImpact` accepts `readonly { readonly key: KeyId }[]` — works with both `ValueDelta[]` and `CanonicalDelta[]`
- `explainDiffs<D>` and `groupDiffByOrigin<D>` are generic over delta type (constraint: `{ readonly key: KeyId }`)
- `explainDiffs` accepts `{ trace: readonly TraceStep[] }` — `CanonicalTraceStep[]` is structurally assignable
- `Change<D>` and `DiffGroup<D>` are generic with default `ValueDelta`

## Entry Points (package.json exports)

| Import path | Entry | Description |
|-------------|-------|-------------|
| `@spaceteams/weft` | `src/index.ts` | Everything |
| `@spaceteams/weft/core` | `src/core.ts` | Keys, values, inputs, facts, semantics |
| `@spaceteams/weft/rules` | `src/rules.ts` | Rule definitions and factories |
| `@spaceteams/weft/model` | `src/model/index.ts` | Model, compile, graph, freeze/hydrate |
| `@spaceteams/weft/evaluate` | `src/evaluate/index.ts` | Evaluation engine |
| `@spaceteams/weft/overlay` | `src/overlay/index.ts` | Overlay evaluation and diffing |
| `@spaceteams/weft/draft` | `src/draft/index.ts` | Draft lifecycle and analysis |
| `@spaceteams/weft/inspect` | `src/inspect/index.ts` | Inspection trees and ASCII |
| `@spaceteams/weft/snapshot` | `src/snapshot/index.ts` | Canonicalization and fingerprinting |

## File Conventions

- **Barrel files**: Each directory has an `index.ts` that re-exports its public API.
- **Test files**: Co-located as `*.test.ts` next to source (in `src/`) or in `examples/src/`.
- **Types**: Prefer `export type` at declaration site. Co-locate types with their implementation.
- **Pure functions**: The library is side-effect-free. No global state, no I/O (except `node:crypto` for fingerprinting).
- **Naming**: Files use kebab-case. Types use PascalCase. Functions use camelCase.

## Testing Patterns

- Tests use Vitest with `toMatchInlineSnapshot` for ASCII inspection trees
- Integration tests in `examples/` use the published `@spaceteams/weft` import (validates the public API surface)
- Frozen artifact round-trip tests verify `freeze → JSON.stringify → JSON.parse → parse/migrate → inspect` produces identical output to live paths
- Test fixtures for migration live in `draft/freeze/__fixtures__/`

## Common Patterns When Making Changes

### Adding a new rule type
1. Create `src/rule/<name>.ts` with spec type + factory function
2. Export from `src/rule/index.ts` (barrel) — no, rule barrel is just `src/rules.ts`
3. Add `export * from "./rule/<name>"` in `src/rules.ts`
4. The main `src/index.ts` already re-exports `src/rules.ts` content
5. Add integration test in `examples/src/`

### Widening a function to accept `ModelStructure`
Replace `CompiledModel` parameter with `ModelStructure` import from `../model/model-structure`. Since `CompiledModel` structurally satisfies `ModelStructure`, existing callers are unaffected.

### Adding fields to frozen artifacts
1. Increment `CURRENT_FROZEN_VERSION` in `draft/freeze/version.ts`
2. Add migration in `draft/freeze/migrations/v<old>-to-v<new>.ts`
3. Register in `draft/freeze/migrate.ts`
4. Update `FrozenEvaluatedDraft` type and `freezeEvaluatedDraft` function
5. Add fixture and test in `draft/freeze/freeze-migration.test.ts`

### Adding to `ModelStructure` / `FrozenModel`
1. Add optional field to `ModelStructure` (keeps structural compat with `CompiledModel`)
2. Add required field to `CompiledModel` in `model/index.ts`
3. Build it in `compileModel` (`model/compile-model.ts`)
4. Add to `FrozenModel` type, `freezeModel`, and `hydrateModel` in `model/freeze-model.ts`
5. Canonicalize if the field contains arbitrary data

## Important Design Decisions

1. **`ModelStructure` is structurally typed** — `CompiledModel` satisfies it implicitly. Any new field added to `ModelStructure` should be optional (to maintain this), while the same field on `CompiledModel` can be required.

2. **Canonicalization is mandatory for frozen data** — All values in `FrozenModel` and `FrozenEvaluatedDraft` must be `CanonicalJson` (sorted keys, normalized values). This ensures deterministic fingerprints.

3. **No live functions cross the freeze boundary** — `Rule.eval`, `KeySemantics.eq/encode/decode`, and `Resolver` never appear in frozen types. Frozen data is pure data.

4. **Generic delta types preserve caller precision** — `explainDiffs<D>` and `groupDiffByOrigin<D>` return `Change<D>[]` / `DiffGroup<D>[]`, so callers passing `CanonicalDelta[]` get canonical types back in the output.

5. **`normalizeDraft` is server-only** — It requires `CompiledModel` (needs semantics for equality checks). Client-side analysis skips normalization (the server normalizes before freezing).

6. **Fingerprinting uses SHA-256** — `fingerprintValue` canonicalizes then hashes with `node:crypto`. This makes it server/Node.js-only; clients use pre-computed fingerprints from `FrozenSnapshot`.
