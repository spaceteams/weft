# Validation Guide

This guide covers the `@spaceteams/weft/validate` module — schema-based validation for weft models using the [Standard Schema V1](https://github.com/standard-schema/standard-schema) ecosystem.

## Overview

The validation module lets you:

1. **Attach schemas** to model keys (inputs and rule outputs)
2. **Define constraints** that validate cross-field relationships
3. **Validate facts, overlays, and derived values** on the server
4. **Freeze schemas as JSON Schema** for client-side validation without round-trips
5. **Expose models as Standard Schema** for integration with form libraries

## Table of Contents

- [Attaching Schemas to Keys](#attaching-schemas-to-keys)
- [Validation Functions](#validation-functions)
- [Cross-Field Constraints](#cross-field-constraints)
- [Pipeline Integration](#pipeline-integration)
- [Client-Side Validation](#client-side-validation)
- [Standard Schema Output](#standard-schema-output)
- [Validation Context](#validation-context)
- [Sync vs Async](#sync-vs-async)
- [ValidationResult Shape](#validationresult-shape)

---

## Attaching Schemas to Keys

Any `StandardSchemaV1`-conforming schema library works: **Valibot**, **Zod**, **ArkType**, or custom schemas.

### On Inputs

```ts
import { createModel, key } from "@spaceteams/weft";
import * as v from "valibot";

const amount = key<number>("amount");
const rate = key<number>("rate");

const m = createModel();

// Schema validates the input value
m.input(amount, {
  schema: v.pipe(v.number(), v.minValue(0), v.maxValue(10_000_000)),
  label: "Loan Amount",
});

// schemaSeverity controls the default severity for this key's issues
m.input(rate, {
  schema: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
  schemaSeverity: "warning",
  label: "Interest Rate",
});
```

### On Rules (Derived Values)

```ts
const totalCost = key<number>("total_cost");

m.rule(
  rule({
    target: totalCost,
    deps: [amount, rate, years],
    spec: { type: "total-cost" },
    eval: (get) => ({ output: get(amount) * get(rate) * get(years) }),
  }),
  {
    schema: v.pipe(v.number(), v.maxValue(10_000_000)),
    schemaSeverity: "warning", // defaults to "warning" for rule outputs
    label: "Total Cost",
  },
);
```

---

## Validation Functions

### `validateFacts(model, facts, context?)`

Validates **all input keys** against their declared schemas.

```ts
import { validateFacts, validateSync } from "@spaceteams/weft";

const result = validateSync(validateFacts(compiled, { amount: -100, rate: 0.05 }));
// result.valid === false
// result.issues[0] === { key: "amount", message: "...", severity: "error" }
```

### `validateOverlay(model, overlay, context?)`

Validates **only keys present in the overlay**. This is the hot path for per-keystroke validation in spreadsheet-like UIs.

```ts
import { validateOverlay, validateSync } from "@spaceteams/weft";

const result = validateSync(validateOverlay(compiled, { rate: 1.5 }));
// Only "rate" is validated — other keys are untouched
```

### `validateDraft(model, draft, context?)`

Validates both `draft.base` (all inputs) and `draft.overlay` (overlay keys only), then merges the results.

```ts
import { validateDraft, validateSync } from "@spaceteams/weft";

const result = validateSync(validateDraft(compiled, draft));
```

### `validateEvaluation(model, evaluationResult, context?)`

Validates **derived values** (rule outputs with schemas) and runs **constraints** against the full evaluation.

```ts
import { evaluate, validateEvaluation, validateSync } from "@spaceteams/weft";

const evalResult = evaluate(compiled, facts);
const validation = validateSync(validateEvaluation(compiled, evalResult));
```

---

## Cross-Field Constraints

Constraints validate relationships between multiple keys. They run after evaluation (they need resolved values).

```ts
import { constraint } from "@spaceteams/weft";

m.constraint(constraint({
  name: "rates-sum-check",
  deps: [interestRate, repaymentRate, specialRepaymentRate],
  severity: "error",
  validate: (get) => {
    const sum = get(interestRate) + get(repaymentRate) + get(specialRepaymentRate);
    if (sum > 1) {
      return { message: `Combined rates exceed 100% (${(sum * 100).toFixed(1)}%)` };
    }
    return null; // null means constraint passes
  },
}));
```

### Constraint Features

- **`deps`** — keys the constraint reads (used to skip if deps are missing)
- **`severity`** — default severity for issues from this constraint
- **`validate(get)`** — receives a resolver to read values; returns `null` or an issue
- **`affectedKeys`** in the result — override which keys are marked as affected

```ts
validate: (get) => {
  if (get(amount) > 1_000_000) {
    return {
      message: "High loan amounts require approval",
      severity: "warning",        // override constraint-level severity
      affectedKeys: ["amount"],   // only mark "amount", not all deps
    };
  }
  return null;
}
```

### Lenient Behavior

If a constraint's dependencies are missing from the evaluation result, the constraint is **skipped** (not failed). This supports partial evaluation with `"lenient"` mode.

---

## Pipeline Integration

### Opt-in Validation in `evaluateDraft`

```ts
import { evaluateDraft } from "@spaceteams/weft";

// Without validation (default — backward compatible)
const result = evaluateDraft(compiled, draft, "lenient");

// With validation
const result = evaluateDraft(compiled, draft, {
  mode: "lenient",
  validate: true,
  validationContext: { phase: "submit" },
});
// result.validation?.issues — merged from inputs + overlay + derived + constraints
```

### Opt-in Validation in `analyzeDraft`

```ts
import { analyzeDraft } from "@spaceteams/weft";

const analysis = analyzeDraft(compiled, draft, {
  validate: true,
  validationContext: { phase: "edit" },
});
// analysis.validation — full merged result
// analysis.evaluated, analysis.changes, etc. — always present regardless of validation
```

**Important**: Validation never aborts the pipeline. Even if inputs are invalid, evaluation and analysis still complete. Validation issues are informational — the consumer decides what to block.

---

## Client-Side Validation

For spreadsheet-like UIs that need validation on every keystroke without server round-trips.

### How It Works

1. **Server** freezes the model with JSON Schema metadata (extracted from schemas that implement `StandardJSONSchemaV1`)
2. **Client** uses `validateFrozenDraft` with a consumer-provided JSON Schema validator

### Server Setup

JSON Schema extraction happens automatically during `freezeModel`:

```ts
import { freezeModel } from "@spaceteams/weft";

const frozenModel = freezeModel(compiled);
// frozenModel.jsonSchemas — contains JSON Schema for keys whose schemas support it
// frozenModel.constraints — serialized constraint metadata
```

### Client Usage

```ts
import { validateFrozenDraft } from "@spaceteams/weft/validate";
import type { JsonSchemaValidator } from "@spaceteams/weft/validate";
import Ajv from "ajv";

// Create a validator adapter (weft doesn't bundle a JSON Schema validator)
const ajv = new Ajv();
const validator: JsonSchemaValidator = (schema, value) => {
  const valid = ajv.validate(schema, value);
  return {
    valid: !!valid,
    errors: ajv.errors?.map((e) => ({
      message: e.message ?? "Validation failed",
      path: e.instancePath,
    })),
  };
};

// Validate — always synchronous
const result = validateFrozenDraft(frozenModel, frozenDraft, validator);
if (!result.valid) {
  for (const issue of result.issues) {
    markFieldError(issue.key, issue.message);
  }
}
```

### What Gets Frozen

| Data | Frozen? | Notes |
|------|---------|-------|
| Per-key JSON Schemas | ✅ | Only for keys whose schemas implement `StandardJSONSchemaV1` |
| Constraint metadata | ✅ | Name, affected keys, severity |
| Constraint functions | ❌ | Can't serialize JS functions |
| Live Standard Schema | ❌ | No live code crosses the freeze boundary |

---

## Standard Schema Output

weft can **expose** a compiled model as a `StandardSchemaV1` instance, making it usable with any library that consumes Standard Schema (form libraries, API frameworks, etc.).

### `toStandardSchema(model)` — Full Fact-Bag Validator

```ts
import { toStandardSchema } from "@spaceteams/weft";

const schema = toStandardSchema(compiled);
// schema implements StandardSchemaV1<FactBag, FactBag>

// Use with any Standard Schema consumer
const result = await schema["~standard"].validate(requestBody);
if (result.issues) {
  return { status: 400, errors: result.issues };
}
```

### `toKeySchema(model, key)` — Per-Key Validator

```ts
import { toKeySchema } from "@spaceteams/weft";

const amountSchema = toKeySchema(compiled, amount);
if (amountSchema) {
  const result = amountSchema["~standard"].validate(userInput);
}
```

Returns `undefined` if the key has no declared schema.

### `toOverlaySchema(model)` — Overlay Validator

```ts
import { toOverlaySchema } from "@spaceteams/weft";

const schema = toOverlaySchema(compiled);
// Only validates keys present in the overlay (partial)
const result = schema["~standard"].validate({ rate: 0.05 });
```

### Metadata

All Standard Schema outputs use:
- `vendor: "@spaceteams/weft"`
- `version: 1`

---

## Validation Context

A `ValidationContext` can be passed through the validation pipeline. It's delivered to schemas as `libraryOptions` in the Standard Schema `validate` call.

```ts
import type { ValidationContext } from "@spaceteams/weft";

// Define your context shape
type MyContext = ValidationContext & {
  phase: "edit" | "submit";
  userRole: "admin" | "user";
};

// Pass it through
const result = validateFacts(compiled, facts, { phase: "submit", userRole: "admin" });
```

In your schema, access via the Standard Schema `options` parameter:

```ts
const conditionalSchema: StandardSchemaV1<unknown, number> = {
  "~standard": {
    version: 1,
    vendor: "custom",
    validate: (value, options) => {
      const ctx = options?.libraryOptions as MyContext | undefined;
      if (ctx?.phase === "submit" && typeof value !== "number") {
        return { issues: [{ message: "Required on submit" }] };
      }
      return { value: value as number };
    },
  },
};
```

---

## Sync vs Async

Validation is **sync by default** and only becomes async if a schema's `validate` function returns a Promise.

### Guaranteeing Sync

Use `validateSync` to assert synchronous behavior (throws if async):

```ts
import { validateSync, validateOverlay } from "@spaceteams/weft";

// Safe if all schemas are sync (Valibot, most Zod schemas)
const result = validateSync(validateOverlay(compiled, overlay));
```

### When Is It Async?

- Schemas that do network calls (rare)
- Schemas using `v.pipeAsync()` in Valibot or `.refine(async ...)` in Zod

### Client-Side: Always Sync

`validateFrozenDraft` is **always synchronous** — it uses JSON Schema, which is inherently sync.

---

## ValidationResult Shape

```ts
type ValidationResult = {
  valid: boolean;           // true if no "error" severity issues
  issues: ValidationIssue[];
  affectedKeys: Set<KeyId>; // all keys with any issue
  errorKeys: Set<KeyId>;    // keys with "error" issues
  warningKeys: Set<KeyId>;  // keys with "warning" issues
};

type ValidationIssue = {
  key: KeyId;
  message: string;
  severity: "error" | "warning" | "info";
  path?: ReadonlyArray<PropertyKey | { key: PropertyKey }>;
};
```

### Severity Semantics

| Severity | Effect on `valid` | Use case |
|----------|-------------------|----------|
| `"error"` | `valid = false` | Blocking — prevents submission |
| `"warning"` | `valid = true` | Advisory — show to user but allow |
| `"info"` | `valid = true` | Informational — hints, suggestions |

### Helper Functions

```ts
import { validResult, failedResult, mergeResults } from "@spaceteams/weft";

// Constructing results manually
const ok = validResult();
const bad = failedResult([{ key: "x", message: "too big", severity: "error" }]);
const combined = mergeResults(result1, result2, result3);
```
