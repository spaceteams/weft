# Examples

Runnable integration tests that demonstrate every major feature of `@spaceteams/weft`.
Each file uses the **published package API** (no internal imports) and doubles as
executable documentation — run them with `pnpm test` from the repo root.

## Reading Order

The examples are listed in a progression from basic to advanced. If you're new to
weft, follow this order:

### 1. Core Concepts

| # | File | What you'll learn |
|---|------|-------------------|
| 1 | [`pricing-arithmetic`](#1-pricing-arithmetic) | Keys, inputs, rules, model compilation, evaluation, dependency graphs, and ASCII inspection trees |
| 2 | [`shorthand-rules`](#2-shorthand-rules) | `numericRules` shorthand, `algebraicRules` for custom algebras, `value()` literals |
| 3 | [`rule-factories`](#3-rule-factories) | The full arithmetic rule catalog (`difference`, `abs`, `negate`, `product`, `min`/`max`, `clamp`, `round`, `conditional`) plus financial rules and overlay what-if analysis |
| 4 | [`non-numeric-rules`](#4-non-numeric-rules) | Mixed-type models with string, boolean, and object rules: `concat`, `template`, `format`, `coerce`, `compare`, `logicalAnd`, `match` (decision tables), `compose`, `pick`, `pluck`, `spread` |

### 2. What-If Analysis & Drafts

| # | File | What you'll learn |
|---|------|-------------------|
| 5 | [`finance`](#5-finance) | Overlay evaluation with origin tracking, full draft analysis pipeline (impact, grouped diffs, explained changes), and diff inspection trees |
| 6 | [`tarifierung`](#6-tarifierung) | A realistic German insurance tariff model combining `match` decision tables, `projection`, and `analyzeDraft` for what-if impact analysis |
| 7 | [`freeze-hydrate`](#7-freeze-hydrate) | The server→client split: `freezeModel` + `freezeEvaluatedDraft` → JSON wire → `analyzeFrozenDraft` + `hydrateModel` for client-side inspection |

### 3. Validation & Schemas

| # | File | What you'll learn |
|---|------|-------------------|
| 8 | [`validation`](#8-validation) | Input validation with Standard Schema (Valibot), overlay validation, draft validation, derived-value validation, cross-field constraints, sync/async handling, and end-to-end workflows |
| 9 | [`standard-schema`](#9-standard-schema) | `toStandardSchema`, `toKeySchema`, and `toOverlaySchema` — using weft models as generic Standard Schema providers |
| 10 | [`json-schema-types`](#10-json-schema-types) | Explicit `jsonSchema` metadata on inputs, `keyValueTypes` derivation, and freeze → JSON → hydrate round-trips |

### 4. Layers

| # | File | What you'll learn |
|---|------|-------------------|
| 11 | [`layers-dimensional`](#11-layers-dimensional) | Automatic SI unit propagation through arithmetic rules, unit mismatch detection, and financial unit preservation |
| 12 | [`layers-display-hints`](#12-layers-display-hints) | Non-propagating display hints (currency, percent), ASCII rendering with layer data, and freeze/hydrate round-trips |
| 13 | [`layers-provenance`](#13-layers-provenance) | Source tracking with confidence scores, derived confidence propagation, freeze/hydrate, and draft overlay analysis |

---

## Example Summaries

### 1. pricing-arithmetic

**File:** [`src/pricing-arithmetic.test.ts`](src/pricing-arithmetic.test.ts)

A simple pricing model: `revenue − costs = gross profit`, then tax and margin
calculations. Demonstrates the core workflow:

- Define typed keys with `key<T>()`
- Register inputs and rules via `createModel()`
- Compile with `compileModel()`
- Visualize dependencies with `toGraph()`
- Inspect structure with `inspectModelTarget()` → `inspectionNodeToAscii()`
- Evaluate with `evaluate()` and trace results with `inspectTraceTarget()`

### 2. shorthand-rules

**File:** [`src/shorthand-rules.test.ts`](src/shorthand-rules.test.ts)

Introduces the ergonomic rule shorthands that avoid passing `defaultNumberOps` everywhere:

- **`numericRules`**: Pre-bound shorthand — `n.sum(...)` instead of `sum(defaultNumberOps, ...)`
- **`algebraicRules(ops)`**: Create your own shorthand for custom ops descriptors
- **`value()` literals**: Inline constants as operands in `weightedSum` and other rules
- Side-by-side comparison showing raw factories and shorthands produce identical results

### 3. rule-factories

**File:** [`src/rule-factories.test.ts`](src/rule-factories.test.ts)

Walks through the built-in rule factories in groups:

- **Arithmetic**: `difference`, `negate`, `abs`
- **Aggregation**: `product`, `minimum`, `maximum`
- **Clamping & rounding**: `clamp`, `round`, `conditional`
- **Financial**: `futureValue`, `annuityPayment`, plus overlay what-if analysis

Also shows trace detail annotations (e.g. `:: clamped`, `:: round(1)`, `:: then`/`:: otherwise`).

### 4. non-numeric-rules

**File:** [`src/non-numeric-rules.test.ts`](src/non-numeric-rules.test.ts)

Demonstrates mixed-type models:

- **String rules**: `concat`, `template`, `format`
- **Type conversion**: `coerce` (string → number)
- **Boolean logic**: `compare`, `logicalAnd`, `conditional`
- **Decision tables**: `match` with `when()` predicates (`.gte()`, `.lt()`, `.eq()`)
- **Object manipulation**: `compose`, `pick`, `pluck`, `spread`
- **Convenience shorthand**: `numericRules` for terser notation (`n.sum`, `n.scale`)

### 5. finance

**File:** [`src/finance.test.ts`](src/finance.test.ts)

A balance sheet model focused on **draft analysis and what-if workflows**:

- `evaluateOverlay` with origin tracking (`base`, `overlay`, `derived`)
- `analyzeDraft` pipeline: impact analysis (`direct`, `affected`, `terminal`)
- Grouped diffs separating overlay inputs from derived effects
- Explained changes with before/after delta values
- Diff inspection trees with `inspectDiffTarget` showing `→` annotations

### 6. tarifierung

**File:** [`src/tarifierung.test.ts`](src/tarifierung.test.ts)

A realistic insurance tariff calculation with:

- Equity ratio derived from balance sheet inputs
- `projection` to extract fields from structured inputs
- Nested `match` tables routing on financial report type and banding on ratios
- Full `analyzeDraft` showing impact analysis (`direct`, `affected`, `terminal` keys)
- Diff inspection trees with before → after values

### 7. freeze-hydrate

**File:** [`src/freeze-hydrate.test.ts`](src/freeze-hydrate.test.ts)

The complete **server→client split** story:

- **Server**: `compileModel` → `evaluateDraft` → `freezeModel` + `freezeEvaluatedDraft`
- **Wire**: `JSON.stringify` → `JSON.parse` (simulating network transfer)
- **Client**: `analyzeFrozenDraft` reconstructs impact, grouped diffs, and changes
- **Client inspection**: `hydrateModel` + `inspectTraceTarget` with frozen trace
- **Parity verification**: frozen path produces identical ASCII output to live path

### 8. validation

**File:** [`src/validation.test.ts`](src/validation.test.ts)

Comprehensive validation coverage:

- `validateFacts()` — validate all inputs against their schemas
- `validateOverlay()` — validate only the keys present in an overlay
- `validateDraft()` — validate base + overlay combined
- `validateEvaluation()` — validate derived values (with `schemaSeverity: "warning"`)
- `constraint()` — cross-field validation rules evaluated post-computation
- `validateSync()` — unwrap async validation results synchronously
- End-to-end: define → validate inputs → evaluate → validate outputs → overlay → re-evaluate

### 9. standard-schema

**File:** [`src/standard-schema.test.ts`](src/standard-schema.test.ts)

Shows how weft models can act as [Standard Schema](https://github.com/standard-schema/standard-schema) providers:

- `toStandardSchema()` — full fact bag validation
- `toKeySchema()` — single-key schema extraction
- `toOverlaySchema()` — partial overlay validation
- Vendor/version metadata
- Generic validator function interop

### 10. json-schema-types

**File:** [`src/json-schema-types.test.ts`](src/json-schema-types.test.ts)

Demonstrates JSON Schema metadata for frozen models:

- Explicit `jsonSchema` option on inputs (string, number, boolean, integer, enum)
- Metadata-only schemas (no validation schema required)
- `keyValueTypes` derivation from JSON Schema `type` field
- Freeze → `JSON.stringify` → `JSON.parse` → hydrate round-trip verification
- Known limitation: Valibot 1.4.0 does not expose `~standard.jsonSchema`

### 11. layers-dimensional

**File:** [`src/layers-dimensional.test.ts`](src/layers-dimensional.test.ts)

The `@spaceteams/weft-layer-dimensional` package provides automatic unit propagation:

- `unit("m")`, `unit("s")` annotations on inputs
- `ratio` propagates m/s, `scale` multiplies m² × m = m³
- `sum`/`difference` preserves units when compatible, omits when mismatched
- Financial rules inherit monetary units (EUR)
- `formatUnit()` renders human-readable strings (e.g. `m/s`, `m³`)
- `showLayers: true` in ASCII rendering

### 12. layers-display-hints

**File:** [`src/layers-display-hints.test.ts`](src/layers-display-hints.test.ts)

The `@spaceteams/weft-layer-display-hints` package adds non-propagating presentation metadata:

- `displayHint({ unit: "EUR", semanticType: "currency" })` annotations
- Hints stay where you put them (no automatic propagation to dependents)
- ASCII inspection with `showLayers: true`
- `freezeModel()` → JSON → `hydrateModel()` preserves layer data

### 13. layers-provenance

**File:** [`src/layers-provenance.test.ts`](src/layers-provenance.test.ts)

The `@spaceteams/weft-layer-provenance` package tracks data lineage:

- `provenance("balance-sheet", 0.95)` — source name + confidence score + optional tags
- Derived values automatically get `source: "derived"` with min-confidence propagation
- Survives `freezeModel()` and `freezeEvaluatedDraft()` round-trips
- Works through `analyzeDraft` overlay analysis

---

## Running

```bash
# From repo root
pnpm test              # run all tests (library + examples)

# Examples only
cd examples
pnpm run test          # run once
pnpm run test:watch    # watch mode
```
