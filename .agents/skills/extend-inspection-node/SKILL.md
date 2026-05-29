---
name: extend-inspection-node
description: Add new data or rendering to weft inspection trees. Use when extending InspectionNode, updating the three inspection builders, or modifying ASCII rendering.
---

# Extend Inspection Node

When adding new data to inspection trees (e.g., layer values, validation results, annotations), you need to update the type, three builders, and optionally the ASCII renderer.

## Architecture

```
InspectionNode (type)
    ↑ built by
    ├── inspectModelTarget()    — static dependency structure (no runtime data)
    ├── inspectTraceTarget()    — runtime values from evaluation trace
    └── inspectDiffTarget()     — values + change annotations from overlay diff
    ↓ rendered by
    inspectionNodeToAscii()     — ASCII tree with configurable annotations
```

## Files to Touch

### 1. Extend `InspectionNode`

**File:** `weft/weft/src/inspect/inspection-node.ts`

The type has four sections — choose where your new field belongs:

```ts
export type InspectionNode = {
  key: KeyId;
  kind: string;    // "input", rule op name, or "rule"
  label: string;

  meta?: {         // ← static metadata (always available)
    key?: KeyMeta;
  };

  structure?: {    // ← model structure (always available)
    ruleSpec?: Record<string, unknown>;
  };

  execution?: {    // ← runtime data (only with trace)
    value?: unknown;
    trace?: TraceStep;
    layers?: Record<string, unknown>;
    // ADD NEW RUNTIME FIELDS HERE
  };

  change?: Change; // ← diff data (only with overlay comparison)

  children: InspectionNode[];
};
```

**Guidelines:**
- Static data goes in `meta` or `structure`
- Runtime evaluation data goes in `execution`
- Diff/overlay data goes at the top level alongside `change`
- All extension fields should be optional

### 2. Update `inspectModelTarget`

**File:** `weft/weft/src/inspect/inspect-model-target.ts`

This builder only has access to `ModelStructure` — no trace, no runtime values. It populates `meta`, `structure`, and `children`. Only update this if your new field comes from model structure.

**Signature:** `inspectModelTarget(model: ModelStructure, target: string): InspectionNode`

### 3. Update `inspectTraceTarget`

**File:** `weft/weft/src/inspect/inspect-trace-target.ts`

This builder has access to trace steps. It uses a recursive `build(key, parentStep?)` pattern:

```ts
function build(key: KeyId, parentStep?: TraceStep): InspectionNode {
  const step = stepByTarget.get(key);
  if (!step) {
    // INPUT NODE — no trace step for this key
    // Get runtime data from parentStep (the rule that depends on this input)
    return {
      key, kind: "input",
      execution: {
        value: parentStep?.inputs[key],
        layers: extractInputLayerValues(parentStep, key),  // from parent's layerInputs
      },
      // ...
    };
  }

  // RULE NODE — has its own trace step
  return {
    key, kind: (step.ruleSpec.op as string) ?? "rule",
    execution: {
      value: step.output,
      trace: step,
      layers: step.layerOutputs ? { ...step.layerOutputs } : undefined,
    },
    // ...
    children: step.deps.map((dep) => build(dep, step)),
  };
}
```

**Key pattern for input nodes:** Inputs don't have their own trace step. Their data comes from the **parent** trace step that lists them as a dependency. Use a helper function to extract data from `parentStep`:

```ts
function extractFromParent(
  parentStep: TraceStep | undefined,
  key: KeyId,
): MyType | undefined {
  if (!parentStep?.myNewField) return undefined;
  // Extract the portion relevant to this key
}
```

**Signature:** `inspectTraceTarget(model: ModelStructure, trace: readonly TraceStep[], target: KeyId): InspectionNode`

### 4. Update `inspectDiffTarget`

**File:** `weft/weft/src/inspect/inspect-diff-target.ts`

Same recursive pattern as `inspectTraceTarget` but also attaches `change` data. Apply the exact same data population logic — both builders should produce identical `execution` fields.

**Tip:** If you add a helper function (like `extractInputLayerValues`), you'll need it in both files. Don't extract it to a shared module unless it's used by 3+ consumers — the duplication is acceptable for 2 files.

**Signature:** `inspectDiffTarget(model: ModelStructure, result: { trace: readonly TraceStep[] }, changes: readonly Change[], target: KeyId): InspectionNode`

### 5. Update ASCII rendering (optional)

**File:** `weft/weft/src/inspect/inspection-node-to-ascii.ts`

If the new data should appear in ASCII output:

1. **Add a `RenderOptions` flag:**
   ```ts
   type RenderOptions = {
     showMeta: boolean;
     showChange: boolean;
     showMyFeature?: boolean;  // optional, defaults to false
   };
   ```

2. **Update `formatLabel`** to append the annotation when the flag is true:
   ```ts
   if (showMyFeature && node.execution?.myField) {
     label += ` <format the data>`;
   }
   ```

3. **Label order convention:**
   ```
   Label [kind] = value (change) :: detail {layers} <your-annotation>
   ```

**Formatting helpers:** For simple values, use `String()`. For objects, use `JSON.stringify()`. Keep the helper private to the file.

## Compatibility Notes

- `InspectionNode` is used by both live and frozen paths — both `CompiledModel` and hydrated `ModelStructure` should work
- The three builders accept `ModelStructure` (not `CompiledModel`) so they work with hydrated frozen models
- Existing inline snapshot tests in `examples/` won't break if new fields are optional and rendering flags default to false

## Verify

```sh
pnpm check
```
