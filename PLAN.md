# PLAN.md — Evaluation Layers

## Motivation

Today, each key in a weft model holds a single value (the computation result). Metadata like `unit` and `semanticType` are static presentation hints that don't participate in evaluation. But real-world use cases demand **behavioral metadata** — units that propagate through computations, provenance that tracks origins, constraints that validate dimensional consistency.

These aren't metadata in the traditional sense. They're parallel evaluation tracks that run alongside the computation layer. Weft should provide the **machinery** for this without opinionating on the content.

## Design Principles

1. **Runtime-first** — Layer propagation happens during evaluation, not at compile time. Avoids type-level burden while the library evolves.
2. **Decoupled from rules** — Layers interpret `spec.op`; rule factories don't know about layers. They meet at the spec.
3. **Sparse** — Not every key needs every layer. Layers handle what they know, have defaults for the rest.
4. **User-defined** — Applications define their own layers (units, provenance, confidence, etc.). Weft provides canonical implementations for common patterns.
5. **Freezable** — Layer values are artifacts. They freeze alongside values so clients can inspect them without re-evaluation.
6. **Versioned** — Each layer declares `name` + `version` so frozen artifacts remain interpretable even as layer logic evolves.

## Architecture

### Core Concept: Multi-Layered Values

Each key in the evaluation graph carries a value per registered layer:

```
Key: speed
├── compute: 50          (the "value" — current behavior)
├── units: m/s           (dimensional analysis layer)
└── provenance: derived  (provenance tracking layer)
```

### LayerEvaluator Interface

```ts
/**
 * A layer evaluator defines how a layer's values propagate through the
 * computation graph. It interprets rule specs independently of rule factories.
 */
type LayerEvaluator<T> = {
  /** Unique layer identifier (e.g., "units", "provenance"). */
  name: string;
  /** Version string for frozen artifact compatibility. */
  version: string;
  /**
   * Given a rule's op, the layer values of its dependencies, and the full
   * rule spec, compute the target's layer value.
   */
  eval(
    op: string,
    deps: ReadonlyMap<KeyId, T>,
    spec: Record<string, unknown>,
  ): T;
  /**
   * Optional fallback when `eval` is not defined or the op is unknown.
   * If absent, the key simply has no value for this layer (sparse).
   */
  default?: (deps: ReadonlyMap<KeyId, T>) => T;
  /**
   * Codec for serialization into frozen artifacts.
   * Required if the layer should be freezable.
   */
  codec?: {
    encode(value: T): CanonicalJson;
    decode(json: CanonicalJson): T;
  };
};
```

### Separation of Concerns

```
Rule Factories          Layer Evaluators
─────────────           ────────────────
Define structure:       Define interpretation:
  - target, deps          - what "ratio" means for units
  - spec.op               - what "sum" means for provenance
  - eval (compute)        - defaults for unknown ops

        ↘                  ↙
         spec.op (shared contract)
```

- Rule factories declare **what** the computation is (deps, spec, eval).
- Layers declare **how to interpret** that computation for their domain.
- New rules don't break existing layers (they hit `default`).
- New layers don't touch existing rules.

### Evaluation Loop

```ts
for (const target of topologicalOrder) {
  const rule = ruleByTarget.get(target);
  const deps = depsByTarget.get(target);

  // Computation layer (current behavior, unchanged)
  const { output } = rule.eval(get);
  values.set(target, output);

  // Additional layers
  for (const [layerName, evaluator] of registeredLayers) {
    const depLayerValues = new Map<KeyId, T>();
    for (const dep of deps) {
      const v = layerValues.get(layerName)?.get(dep);
      if (v !== undefined) depLayerValues.set(dep, v);
    }
    const result = evaluator.eval(rule.spec.op, depLayerValues, rule.spec);
    if (result !== undefined) {
      layerValues.get(layerName)!.set(target, result);
    }
  }
}
```

Layers are evaluated in the same topological order. They see only their own dep values (sparse — missing deps simply aren't in the map).

## Model API

### Registering Layers

```ts
const m = createModel();

// Register a layer evaluator on the model
m.layer(dimensionalAnalysis);
m.layer(provenanceTracker);
```

### Annotating Inputs with Layer Values

```ts
m.input(distance, { label: "Distance" });
m.annotate(distance, "units", meter);
m.annotate(distance, "provenance", { source: "GPS", confidence: 0.95 });

m.input(time, { label: "Duration" });
m.annotate(time, "units", second);
```

### Rules — Unchanged

```ts
m.rule(ratio(ops, speed, distance, time), { label: "Speed" });
// Layer propagation happens automatically during evaluation.
// The "ratio" op is interpreted by each registered layer's eval().
```

### Evaluation

```ts
const result = evaluate(model, facts);
// result.values       — Map<KeyId, unknown>         (computation layer)
// result.layers       — Map<string, Map<KeyId, unknown>>  (layer results)
// result.layers.get("units")?.get("speed") → Unit("m/s")
```

## Example: Dimensional Analysis Layer

```ts
import type { LayerEvaluator } from "@spaceteams/weft";

type Unit = { num: string[]; denom: string[] }; // rational unit type

const dimensionalAnalysis: LayerEvaluator<Unit> = {
  name: "units",
  version: "1",
  eval(op, deps, spec) {
    const values = [...deps.values()];
    switch (op) {
      case "sum":
      case "difference":
      case "weightedSum":
        return assertAllEqual(values);
      case "ratio":
        return divide(deps.get(spec.numerator)!, deps.get(spec.denominator)!);
      case "scale":
        return deps.get(spec.deps[0])!; // scalar is dimensionless
      case "product":
        return values.reduce(multiply);
      case "futureValue":
      case "annuityPayment":
        return deps.get(spec.pv)!; // financial ops preserve monetary unit
      default:
        return values[0]; // identity: inherit from first dep
    }
  },
  codec: {
    encode: (u) => ({ num: u.num, denom: u.denom }),
    decode: (j) => j as Unit,
  },
};
```

## Example: Provenance Layer

```ts
type Provenance = {
  source: string;
  confidence?: number;
};

const provenanceTracker: LayerEvaluator<Provenance> = {
  name: "provenance",
  version: "2",
  eval(op, deps) {
    // Derived values inherit min confidence from their deps
    const sources = [...deps.values()];
    const minConfidence = Math.min(...sources.map((s) => s.confidence ?? 1));
    return { source: "derived", confidence: minConfidence };
  },
  default: () => ({ source: "unknown" }),
  codec: {
    encode: (p) => p as CanonicalJson,
    decode: (j) => j as Provenance,
  },
};
```

## Frozen Artifacts

Layer results freeze alongside values:

```ts
type FrozenEvaluatedDraft = {
  version: number;
  values: Record<KeyId, CanonicalJson>;
  layers?: Record<string, FrozenLayerData>;
  // ...existing fields...
};

type FrozenLayerData = {
  name: string;
  version: string;
  /** Computed layer values for all keys (sparse — only keys with values). */
  values: Record<KeyId, CanonicalJson>;
  /** Input annotations that seeded this layer. */
  inputs: Record<KeyId, CanonicalJson>;
};
```

An application that registered `"provenance/2"` can re-evaluate that layer from the frozen model + inputs. Weft can always *display* frozen layer values (via codec.decode) even without the evaluator — it just can't re-run propagation.

## Inspection

Layer values integrate with the existing inspection tree:

```ts
type InspectionNode = {
  key: KeyId;
  label: string;
  kind: string;
  meta?: { key?: KeyMeta };
  execution?: {
    value?: unknown;
    layers?: Record<string, unknown>; // layer values for this node
    trace?: TraceStep;
  };
  // ...
};
```

ASCII rendering can optionally show layer annotations:

```
└── Speed [ratio] = 50 {units: m/s, provenance: derived}
    ├── Distance [input] = 100 {units: m, provenance: GPS}
    └── Duration [input] = 2 {units: s, provenance: stopwatch}
```

## Migration Path

### Phase 1: Remove `unit` and `semanticType` from `KeyMeta`

`KeyMeta` becomes purely presentational:

```ts
type KeyMeta = {
  readonly label?: string;
  readonly description?: string;
  readonly group?: string;
  readonly order?: number;
};
```

This is a breaking change. Applications currently using `unit`/`semanticType` for display hints will need to either:
- Move to a layer (if they want propagation behavior), or
- Use a simple "display hints" layer that weft provides as a convenience.

### Phase 2: Layer Infrastructure ✅

1. `LayerEvaluator<T>` type definition (`src/layer.ts`)
2. `m.layer(evaluator)` — register a layer on the model
3. `m.annotate(key, layerName, value)` — set input layer values
4. Layer storage on `Model` and `CompiledModel` (`layers`, `layerInputs`)
5. Evaluation loop dispatches to registered layers
6. `EvaluationResult.layers` — layer results alongside values

### Phase 3: Freeze/Hydrate Support ✅

1. `FrozenLayerMeta` type (name, version, serialized inputs) on `FrozenModel`
2. `freezeEvaluatedDraft` includes `layers` field (computed layer values)
3. `hydrateModel` restores layer metadata on `ModelStructure`
4. Frozen artifact version bump (v2 → v3) with migration `v2-to-v3.ts`

### Phase 4: Inspection & Overlay Integration ✅

1. `InspectionNode.execution.layers` carries per-layer values at each node
2. `inspectionNodeToAscii` renders layer annotations with `showLayers: true`
3. `diffResults` returns `layerDeltas` — per-layer `ValueDelta[]` for overlay changes
4. `TraceStep.layerInputs` / `TraceStep.layerOutputs` capture per-step layer I/O
5. `CanonicalTraceStep` extends with the same fields, canonicalized via layer codecs

Agent skills created to codify cross-cutting patterns discovered during Phase 4:
- `extend-evaluation-pipeline` — adding data that flows evaluate → trace → canonical → freeze → inspect
- `extend-inspection-node` — adding data/rendering to the inspection tree and its three builders
- `write-weft-tests` — test conventions, model setup patterns, and assertion idioms

### Phase 5: Canonical Implementations (Optional, Application-Level)

Weft MAY ship convenience layers for common patterns:
- `@spaceteams/weft/layers/display-hints` — simple non-propagating layer for `unit`/`semanticType` (migration path from current `KeyMeta` fields)
- `@spaceteams/weft/layers/dimensional` — SI unit propagation and validation
- `@spaceteams/weft/layers/provenance` — source tracking with confidence

These would be optional, application-level packages — not core dependencies.

### Phase 6: Developer Experience & Examples Polish

#### 6a. `compileModelOrThrow` public helper ✅
The `compileOrFail` pattern was duplicated across 4+ example/test files. Added a public utility `compileModelOrThrow(model) → CompiledModel` that throws on compile errors, exported from `@spaceteams/weft/model` and re-exported from `@spaceteams/weft`. Updated examples to use it.

#### 6b. Structured value rendering in inspection trees ✅
Values rendered with `String()` produced `[object Object]` for structured inputs. Added `formatValue()` that applies `JSON.stringify` for objects/arrays and `String()` for primitives. Updated inline snapshots.

#### 6c. Freeze/hydrate end-to-end example ✅
Added `examples/src/freeze-hydrate.test.ts` demonstrating the full server→client flow: `compileModel` → `evaluateDraft` → `freezeModel` + `freezeEvaluatedDraft` → JSON wire → `analyzeFrozenDraft` → `hydrateModel` + `inspectTraceTarget`.

#### 6d. `numericRules` / `algebraicRules` introduction example ✅
Added `examples/src/shorthand-rules.test.ts` comparing raw factory calls (`sum(defaultNumberOps, ...)`) vs the `numericRules` shorthand (`n.sum(...)`) and showing how `algebraicRules(customOps)` works for custom algebras.

#### 6e. Consolidate overlapping examples ✅
Refocused `finance.test.ts` as the draft analysis showcase: removed display-hints layer (already covered in its own example), added structured tests for `evaluateOverlay` origins, `impact`, `groupedDiffs`, and `changes`.

#### 6f. Update examples README ✅
Updated `examples/README.md` with a 4-section guided reading order (Core Concepts → What-If Analysis → Validation & Schemas → Layers) covering all 13 example files. Updated root `README.md` examples table.

### Phase 7: Architectural Improvements

#### 7a. Deduplicate barrel exports ✅
`src/index.ts` and `src/rules.ts` both maintained identical lists of `export * from "./rule/..."` lines. Replaced the 30-line rule export block in `src/index.ts` with `export * from "./rules"`. `src/rules.ts` is now the single source of truth for rule exports.

#### 7b. Shared `Operand` resolution helper ✅
Extracted `operandDeps(operands[])` and `operandDep(operand)` helpers to `src/rule/operand.ts`. Refactored `product.ts`, `min-max.ts`, `difference.ts`, `financial.ts`, and `clamp.ts` to use them, eliminating duplicated `deps.filter(d => d.__kind === "key")` and `if (x.__kind === "key") deps.push(x)` patterns.

#### 7c. Error boundary in evaluation
If a single rule's `eval()` throws (e.g. division by zero), the entire evaluation aborts. Add per-key error capture: `EvaluationResult.errors: Map<KeyId, Error>`. Downstream rules that depend on errored keys propagate the error. Trace steps mark errored rules. Mirrors spreadsheet `#DIV/0!` behavior — one bad cell doesn't kill the sheet.

#### 7d. Rule spec discriminated union
Rule specs are typed as `Record<string, unknown>` at the structural level. Each factory defines its own spec type (`SumSpec`, `RatioSpec`, etc.) but they're never gathered into a discriminated union. Layer evaluators and inspection dispatch on `spec.op` with zero type narrowing. Introduce `type RuleSpec = SumSpec | RatioSpec | ...` (possibly open-ended via module augmentation) to give exhaustive switch checking.

#### 7e. Layer annotation type safety
`m.annotate(key, "units", value)` accepts `unknown` — wrong types or swapped layer names are not caught. Change the API to `m.annotate(key, layerEvaluator, value)` where the second argument is the layer instance, enabling TypeScript to infer and check the value type.

#### 7f. Inspection builder consolidation
`inspectModelTarget`, `inspectTraceTarget`, `inspectDiffTarget` each independently reimplement the dep-walking, label-resolving, kind-resolving tree construction. Only the decoration (values, deltas, layers) differs. Extract a shared tree builder with a "decoration strategy" to reduce the maintenance surface.

#### 7g. Canonicalization validation fence
`freezeEvaluatedDraft` canonicalizes all values, but there's no check that values are canonicalizable. `Date`, `Set`, `Map`, `RegExp`, or circular references either silently lose data or throw deep in the freeze path. Add an `assertCanonicalizable` check with a clear error identifying the offending key.

## Open Questions

- **Layer evaluation errors**: If a layer's `eval` throws (e.g., incompatible units in a sum), should this be a hard error or a diagnostic collected alongside the result? Leaning toward diagnostic — don't block computation for a layer failure.
- **Cross-layer interaction**: Can one layer read another layer's values? (e.g., a "formatted display" layer that reads both computation + units to produce "$50/hr"). Probably yes, with explicit dependency declaration between layers.
- **Overlay layer semantics**: When an overlay changes an input, do layer input annotations also get overlayed? Probably yes — an overlay might say "use centimeters instead of meters" for a what-if analysis.
- **Layer ordering**: If layers can depend on each other, they need topological ordering too. But for v1, independent layers evaluated in registration order is sufficient.
