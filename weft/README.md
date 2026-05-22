# @spaceteams/weft

**Turns business logic into inspectable computation graphs.**

weft is a typed computation model library for overlay-based what-if analysis. Define a graph of typed inputs and computed rules, then explore *"what if we changed X?"* scenarios via overlays. Every step is inspectable — trace how values propagate, visualize dependency trees, and explain diffs in human-readable form.

Designed for a **server/client split**: models are compiled and evaluated on the server, then frozen into JSON-safe artifacts that clients can hydrate and analyze without round-trips.

## Installation

```bash
npm install @spaceteams/weft
# or
pnpm add @spaceteams/weft
# or
yarn add @spaceteams/weft
```

- **ESM only** — ships as `.mjs` with `.d.mts` type declarations
- **TypeScript** — strict mode, full type inference
- **Runtime dependency** — `@standard-schema/spec@1.1.0` (types only)

## Quick Start

```ts
import {
  key,
  createModel,
  compileModel,
  sum,
  defaultNumberOps,
  evaluate,
  createDraft,
  analyzeDraft,
} from "@spaceteams/weft";

// 1. Define typed keys
const a = key<number>("a");
const b = key<number>("b");
const total = key<number>("total");

// 2. Build a model
const m = createModel();
m.input(a, { label: "Amount A" });
m.input(b, { label: "Amount B" });
m.rule(sum(defaultNumberOps, total, [a, b]), { label: "Total" });

// 3. Compile
const result = compileModel(m.build());
if (!result.ok) throw new Error(result.issues.map((i) => i.message).join());
const compiled = result.model;

// 4. Evaluate
const evalResult = evaluate(compiled, { a: 100, b: 50 });
// evalResult.values.get("total") === 150

// 5. What-if analysis
const draft = createDraft("my-draft", { a: 100, b: 50 }, { b: 75 });
const analysis = analyzeDraft(compiled, draft, "lenient");
// analysis.changes — explained diffs for each affected key
// analysis.impact — upstream/downstream impact classification
// analysis.groupedDiffs — diffs grouped by origin (base/overlay/derived)
```

## Core Concepts

### Keys & Types

```ts
import { key } from "@spaceteams/weft";

const loanAmount = key<number>("loan_amount");
const interestRate = key<number>("interest_rate");
```

`Key<T>` is a typed identifier. It carries **no value** — just an ID and a phantom type. Keys are used to wire inputs, rules, and overlays together in a type-safe way.

### Inputs & Rules

- **`Input<T>`** declares a value that users provide (facts)
- **`Rule<T>`** declares a computed value derived from dependencies

### Model Building

```ts
import { createModel, compileModel, sum, defaultNumberOps, key } from "@spaceteams/weft";

const a = key<number>("a");
const b = key<number>("b");
const total = key<number>("total");

const m = createModel();
m.input(a, { label: "Amount A" });
m.input(b, { label: "Amount B" });
m.rule(sum(defaultNumberOps, total, [a, b]), { label: "Total" });

const result = compileModel(m.build());
if (!result.ok) throw new Error(result.issues.map((i) => i.message).join());
const compiled = result.model;
```

Compilation validates the model (cycle detection, missing dependencies, duplicate targets) and produces a `CompiledModel` with a topologically sorted dependency graph.

### Evaluation

```ts
import { evaluate } from "@spaceteams/weft";

const result = evaluate(compiled, { a: 100, b: 50 });
// result.values — Map of all computed values
// result.missing — keys that could not be evaluated (missing inputs)
// result.trace — per-rule execution details
// result.order — topological evaluation order
```

Evaluation is **pure** — no side effects, no mutation, deterministic output for given inputs.

### Overlays & Drafts (What-If Analysis)

An **overlay** is a set of proposed value overrides. A **draft** pairs a base fact bag with an overlay, enabling side-by-side comparison:

```ts
import { analyzeDraft, createDraft } from "@spaceteams/weft";

const draft = createDraft("my-draft", { a: 100, b: 50 }, { b: 75 });
const analysis = analyzeDraft(compiled, draft, "lenient");
// analysis.evaluated — full evaluation results (base + overlay)
// analysis.changes — explained diffs for each affected key
// analysis.impact — upstream/downstream impact classification
// analysis.groupedDiffs — diffs grouped by origin (base/overlay/derived)
```

Each value is tagged with its **origin**:
- `"base"` — unchanged from the original facts
- `"overlay"` — directly overridden
- `"derived"` — recomputed because a dependency changed

### Freeze / Hydrate (Server → Client)

Freeze compiled models and evaluated drafts into JSON-safe artifacts for transport:

```ts
import { freezeModel, freezeEvaluatedDraft, analyzeFrozenDraft } from "@spaceteams/weft";

// Server-side: freeze for transport
const frozenModel = freezeModel(compiled);
const frozenDraft = freezeEvaluatedDraft(compiled, analysis.evaluated);

// Client-side: full analysis without a server round-trip
const clientAnalysis = analyzeFrozenDraft(frozenModel, frozenDraft);
// clientAnalysis.impact, clientAnalysis.groupedDiffs, clientAnalysis.changes, clientAnalysis.values
```

Frozen artifacts are versioned and auto-migrated on parse, so clients stay forward-compatible.

### Inspection (Debugging & Visualization)

Build and render dependency trees for debugging:

```ts
import { inspectModelTarget, inspectTraceTarget, inspectionNodeToAscii } from "@spaceteams/weft";

// Static dependency tree
const tree = inspectModelTarget(compiled, "total");
console.log(inspectionNodeToAscii(tree, { showMeta: true }));
// └── Total [sum]
//     ├── Amount A [input]
//     └── Amount B [input]

// Runtime trace with values
const trace = inspectTraceTarget(compiled, evalResult.trace, "total");
console.log(inspectionNodeToAscii(trace, { showMeta: true }));
// └── Total [sum] = 150
//     ├── Amount A [input] = 100
//     └── Amount B [input] = 50
```

Three inspection entry points:
- `inspectModelTarget` — static dependency structure
- `inspectTraceTarget` — runtime values from evaluation trace
- `inspectDiffTarget` — values + change annotations

## Validation

The validation module (`@spaceteams/weft/validate`) provides schema-based validation that integrates with the [Standard Schema V1](https://github.com/standard-schema/standard-schema) ecosystem (Zod, Valibot, ArkType, etc.).

### Attaching Schemas to Keys

```ts
import { createModel, key } from "@spaceteams/weft";
import * as v from "valibot";

const amount = key<number>("amount");
const rate = key<number>("rate");

const m = createModel();
m.input(amount, { schema: v.pipe(v.number(), v.minValue(0)), label: "Loan Amount" });
m.input(rate, {
  schema: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
  schemaSeverity: "warning",
  label: "Interest Rate",
});
```

Any `StandardSchemaV1`-conforming schema works (Zod, Valibot, ArkType, custom).

### Validating Facts & Overlays

```ts
import { validateFacts, validateOverlay, validateDraft, validateSync } from "@spaceteams/weft";

// Validate all inputs
const result = validateSync(validateFacts(compiled, facts));
if (!result.valid) {
  for (const issue of result.issues) {
    console.log(`${issue.key}: ${issue.message} [${issue.severity}]`);
  }
}

// Validate only overlay keys (hot path for per-keystroke validation)
const overlayResult = validateSync(validateOverlay(compiled, overlay));

// Validate entire draft (base + overlay)
const draftResult = validateSync(validateDraft(compiled, draft));
```

### Cross-Field Constraints

```ts
import { constraint } from "@spaceteams/weft";

m.constraint(
  constraint({
    name: "rates-sum-check",
    deps: [interestRate, repaymentRate, specialRepaymentRate],
    severity: "error",
    validate: (get) => {
      const sum = get(interestRate) + get(repaymentRate) + get(specialRepaymentRate);
      if (sum > 1) return { message: "Combined rates exceed 100%" };
      return null;
    },
  }),
);
```

### Validating Derived Values (Post-Evaluation)

```ts
import { validateEvaluation } from "@spaceteams/weft";

const evalResult = evaluate(compiled, facts);
const validation = validateSync(validateEvaluation(compiled, evalResult));
// Runs schemas on rule outputs + executes constraints
```

### Pipeline-Integrated Validation

```ts
// Opt-in validation during evaluation
const evaluated = evaluateDraft(compiled, draft, { validate: true });
// evaluated.validation contains merged issues from inputs, overlay, and derived values

// Full analysis with validation
const analysis = analyzeDraft(compiled, draft, { validate: true });
// analysis.validation available
```

### Client-Side Validation (Frozen Models)

```ts
import { validateFrozenDraft } from "@spaceteams/weft/validate";
import type { JsonSchemaValidator } from "@spaceteams/weft/validate";

// Consumer provides a JSON Schema validator adapter (e.g., wrapping Ajv)
const validator: JsonSchemaValidator = (schema, value) => {
  const ajv = new Ajv();
  const valid = ajv.validate(schema, value);
  return {
    valid: !!valid,
    errors: ajv.errors?.map((e) => ({ message: e.message!, path: e.instancePath })),
  };
};

const result = validateFrozenDraft(frozenModel, frozenDraft, validator);
// Always synchronous — no server round-trip needed
```

### Standard Schema Output (weft as a schema provider)

```ts
import { toStandardSchema, toKeySchema, toOverlaySchema } from "@spaceteams/weft";

// Full fact-bag validator as StandardSchemaV1
const factsSchema = toStandardSchema(compiled);

// Single key validator
const amountSchema = toKeySchema(compiled, amount);

// Overlay validator (partial — only validates present keys)
const overlaySchema = toOverlaySchema(compiled);

// Use with any Standard Schema consumer
const result = await factsSchema["~standard"].validate(requestBody);
```

## Rule Factories

Built-in rule factories for common computation patterns:

### Arithmetic (ops-aware)

| Factory | Description | Algebra Trait |
| --- | --- | --- |
| `sum(ops, target, deps)` | Sum of N dependencies | `Additive<T>` |
| `difference(ops, target, a, b)` | Subtraction: a − b | `Additive<T>` |
| `negate(ops, target, source)` | Unary negation: −value | `Additive<T>` |
| `product(ops, target, factors)` | Multiplication of N factors | `Scalable<T, T>` |
| `scale(ops, target, base, factor)` | Multiply value by factor | `Scalable<T, S>` |
| `ratio(ops, target, numerator, denominator)` | Division of two keys | `Divisible<T, R>` |
| `minimum(ops, target, deps)` | Minimum of N keys | `Order<T>` |
| `maximum(ops, target, deps)` | Maximum of N keys | `Order<T>` |
| `abs(ops, target, source)` | Absolute value | `Order<T> & Additive<T>` |
| `clamp(ops, target, value, min, max)` | Bound value between min/max | `Order<T>` |
| `weightedSum(ops, target, entries)` | Weighted sum with per-entry weights | `Additive<T> & Scalable<T, S>` |

### Number-specific

| Factory | Description |
| --- | --- |
| `round(target, source, options?)` | Rounding (round/floor/ceil/trunc) with decimal precision |
| `futureValue(target, rate, nper, pmt, pv)` | Financial future value (FV) |
| `presentValue(target, rate, nper, pmt, fv)` | Financial present value (PV) |
| `annuityPayment(target, rate, nper, pv)` | Financial annuity payment (PMT) |

### Logic & Control Flow

| Factory | Description |
| --- | --- |
| `conditional(target, condition, then, otherwise)` | If/then/else branching |
| `decision(target, deps, table)` | Lookup table / decision matrix |
| `projection(ops, target, base, years)` | Time-based projection |

### Custom Rules

```ts
import { rule, key } from "@spaceteams/weft";

const loanAmount = key<number>("loan_amount");
const interestRate = key<number>("interest_rate");
const termYears = key<number>("term_years");
const monthlyPayment = key<number>("monthly_payment");

m.rule(
  rule({
    target: monthlyPayment,
    deps: [loanAmount, interestRate, termYears],
    spec: { type: "annuity" },
    eval: (get) => {
      const r = get(interestRate) / 12;
      const n = get(termYears) * 12;
      const output = get(loanAmount) * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
      return { output };
    },
  }),
);
```

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                        SERVER                             │
│                                                          │
│  createModel() → compileModel() → CompiledModel          │
│                                                          │
│  evaluate(model, facts) → EvaluationResult               │
│  evaluateOverlay(model, base, overlay) → OverlayResult   │
│  evaluateDraft(model, draft) → EvaluatedDraft            │
│  analyzeDraft(model, draft) → DraftAnalysis              │
│                                                          │
│  validateFacts / validateOverlay / validateEvaluation     │
│                                                          │
│  freezeModel(model) → FrozenModel                        │
│  freezeEvaluatedDraft(model, eval) → FrozenEvaluatedDraft│
│                                                          │
└──────────────────────────┬───────────────────────────────┘
                           │ JSON transport
┌──────────────────────────▼───────────────────────────────┐
│                        CLIENT                            │
│                                                          │
│  analyzeFrozenDraft(frozenModel, frozenDraft)             │
│    → ClientDraftAnalysis                                 │
│                                                          │
│  validateFrozenDraft(frozenModel, frozenDraft, validator) │
│    → ValidationResult (sync, no server round-trip)       │
│                                                          │
│  inspectModelTarget / inspectTraceTarget / inspectDiff    │
│  inspectionNodeToAscii(node) → string                    │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## Subpath Exports

Tree-shake by importing only what you need:

| Import path | Description |
| --- | --- |
| `@spaceteams/weft` | Everything |
| `@spaceteams/weft/core` | Keys, values, inputs, facts, semantics |
| `@spaceteams/weft/rules` | Rule definitions and factories |
| `@spaceteams/weft/model` | Model building, compilation, graphs, freeze/hydrate |
| `@spaceteams/weft/evaluate` | Pure evaluation engine |
| `@spaceteams/weft/overlay` | Overlay evaluation, diffing, grouping, explanation |
| `@spaceteams/weft/draft` | Draft lifecycle, analysis, freeze/parse/migrate |
| `@spaceteams/weft/inspect` | Inspection trees and ASCII rendering |
| `@spaceteams/weft/snapshot` | Canonical serialization and fingerprinting |
| `@spaceteams/weft/validate` | Schema validation, constraints, Standard Schema |

## API Reference

### Core Types

| Type | Description |
| --- | --- |
| `Key<T>` | Typed identifier for a value in the model |
| `KeyId` | String alias for `Key<T>.id` |
| `FactBag` | `Record<KeyId, unknown>` — input values |
| `Overlay` | `Record<KeyId, unknown>` — proposed overrides |
| `Input<T>` | Declaration of an input key |
| `Rule<T>` | Computation node: target + deps + eval function + spec |

### Model Types

| Type | Description |
| --- | --- |
| `Model` | Uncompiled model (inputs + rules + semantics + metadata) |
| `CompiledModel` | Validated model with dependency graph and topological order |
| `ModelStructure` | Structural subset (works on both server and client) |
| `FrozenModel` | JSON-safe model snapshot for transport |

### Evaluation Types

| Type | Description |
| --- | --- |
| `EvaluationResult` | `{ values, missing, order, trace }` |
| `TraceStep` | Per-rule execution trace (target, deps, inputs, output, ruleSpec) |
| `OverlayEvaluationResult` | Evaluation + `overlayedFacts` + `origins` |
| `ValueDelta` | Discriminated union: `added` / `removed` / `changed` |
| `ValueOrigin` | `"base"` / `"overlay"` / `"derived"` |

### Draft Types

| Type | Description |
| --- | --- |
| `Draft` | `{ draftId, base, overlay }` |
| `EvaluatedDraft` | Draft + evaluation results + deltas |
| `DraftAnalysis` | Full analysis (impact, groupedDiffs, changes) |
| `ClientDraftAnalysis` | Client-side analysis from frozen data |
| `FrozenEvaluatedDraft` | JSON-safe evaluated draft for transport |

### Validation Types

| Type | Description |
| --- | --- |
| `ValidationResult` | `{ valid, issues, affectedKeys, errorKeys, warningKeys }` |
| `ValidationIssue` | `{ key, message, severity, path? }` |
| `ValidationSeverity` | `"error" \| "warning" \| "info"` |
| `Constraint` | Cross-field validation rule |
| `KeySchema<T>` | Schema attached to a key |
| `JsonSchemaValidator` | Adapter for client-side validation |

## License

[MIT](./LICENSE)
