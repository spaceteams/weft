---
name: extend-evaluation-pipeline
description: Add new data that flows through the weft evaluation pipeline. Use when adding fields to TraceStep, CanonicalTraceStep, or EvaluationResult that need to propagate through canonicalization, freezing, and inspection.
---

# Extend the Evaluation Pipeline

When adding new data that the evaluation engine produces and that should flow through to frozen artifacts and inspection, you need to touch a coordinated set of files. This skill maps the full pipeline and the order of operations.

## Pipeline Overview

```
evaluate()               → TraceStep / EvaluationResult
    ↓
canonicalizeTraceStep()   → CanonicalTraceStep
    ↓
freezeEvaluatedDraft()    → FrozenEvaluatedDraft
    ↓
parseFrozenArtifact()     → (migration if version bumped)
    ↓
inspectTraceTarget()      → InspectionNode
inspectDiffTarget()       → InspectionNode
    ↓
inspectionNodeToAscii()   → string
```

## Files to Touch (in order)

### 1. Extend `TraceStep`

**File:** `weft/weft/src/evaluate/trace-step.ts`

Add new optional `readonly` fields. Keep them optional so existing trace steps without the data remain valid.

```ts
export type TraceStep = {
  // ... existing fields ...
  /** Describe the new field. */
  readonly myNewField?: Readonly<Record<string, unknown>>;
};
```

### 2. Populate during evaluation

**File:** `weft/weft/src/evaluate/index.ts`

Update the evaluation loop to compute and attach the new data. Build the data alongside existing logic, then spread it into the trace step object:

```ts
trace.push({
  target, deps, ruleSpec: rule.spec, keyMeta, detail: detail ?? {}, inputs, output,
  ...(myNewData && { myNewField: myNewData }),
});
```

**Pattern:** Use sparse optional fields — only include the field when there's data. This avoids polluting trace steps for models that don't use the feature.

### 3. Extend `CanonicalTraceStep`

**File:** `weft/weft/src/snapshot/canonicalizeTraceStep.ts`

Add the same fields but with `CanonicalJson` values instead of `unknown`:

```ts
export type CanonicalTraceStep = {
  // ... existing fields ...
  readonly myNewField?: Readonly<Record<string, CanonicalJson>>;
};
```

### 4. Update `canonicalizeTraceStep()`

**Same file:** `weft/weft/src/snapshot/canonicalizeTraceStep.ts`

Add canonicalization logic. If the data comes from a source with a codec (e.g., layer evaluators), use the codec; otherwise fall back to `canonicalize()`:

```ts
return {
  // ... existing fields ...
  ...(step.myNewField && {
    myNewField: canonicalizeMyNewField(model, step.myNewField),
  }),
};
```

The `canonicalizeTraceStep` function receives a `CompiledModel`, so you have access to `model.layers`, `model.semantics`, etc. for codec lookup.

### 5. (If needed) Update frozen artifact types

If the new data should appear in `FrozenEvaluatedDraft` beyond what `CanonicalTraceStep` carries:

- **Type:** `weft/weft/src/draft/freeze/freeze-evaluated-draft.ts`
- **Serialization:** `freezeEvaluatedDraft()` in the same file
- **Migration:** See the `frozen-artifact-migration` skill

If the new data is embedded in `CanonicalTraceStep` (which is already part of `FrozenEvaluatedDraft.trace`), no additional freeze changes are needed.

### 6. Update inspection builders

See the `extend-inspection-node` skill for the full pattern. The key files:

- `weft/weft/src/inspect/inspection-node.ts` — add field to `InspectionNode`
- `weft/weft/src/inspect/inspect-trace-target.ts` — populate from trace step
- `weft/weft/src/inspect/inspect-diff-target.ts` — same
- `weft/weft/src/inspect/inspection-node-to-ascii.ts` — render if needed

### 7. (If needed) Update overlay diffing

If the new data should be diffed between base and overlay evaluations:

**File:** `weft/weft/src/overlay/diff-results.ts`

Extend the `diffResults` return type with a new optional field.

## Key Design Patterns

### Sparse optional fields

Always make pipeline extensions optional. This ensures:
- Models without the feature produce unchanged output
- Old frozen artifacts remain compatible
- Existing tests don't break

### Codec-aware canonicalization

When canonicalizing values that may have a custom codec (e.g., layer values):

```ts
const evaluator = model.layers.find((l) => l.name === layerName);
const canonical = evaluator?.codec ? evaluator.codec.encode(value) : canonicalize(value);
```

### Input node pattern (inspection)

For inspection, rule nodes get data directly from the trace step. Input nodes (which have no trace step) get data from the **parent** trace step. See `extractInputLayerValues` in `inspect-trace-target.ts` for the pattern.

## Verify

```sh
pnpm check
```

All 7 tasks (test, lint, format, typecheck, build for both packages) should pass.
