---
name: write-weft-tests
description: Write tests for weft features following project conventions. Use when creating new test files or adding tests to existing ones. Covers model setup, layer configuration, test helpers, and assertion patterns.
---

# Write Weft Tests

Test conventions, patterns, and helpers for the weft project.

## File Placement

Tests are co-located with source files as `*.test.ts`:

```
weft/weft/src/evaluate/layer.test.ts        ← unit tests for layer evaluation
weft/weft/src/inspect/inspect-layers.test.ts ← unit tests for inspection layers
weft/examples/src/finance.test.ts            ← integration tests using published API
```

- **Unit tests** go in `weft/weft/src/<module>/` next to the code they test
- **Integration tests** go in `weft/examples/src/` and import from `@spaceteams/weft`

## Imports

### Unit tests (in `weft/weft/src/`)

```ts
import { describe, expect, it } from "vitest";
import type { KeyId } from "../key";
import { key } from "../key";
import type { LayerEvaluator } from "../layer";
import { compileModel } from "../model/compile-model";
import { createModel } from "../model/create-model";
import { rule } from "../rule";
import { evaluate } from "../evaluate";
```

Use relative imports. Use `import type` for type-only imports.

### Integration tests (in `weft/examples/src/`)

```ts
import { describe, expect, it } from "vitest";
import {
  compileModel,
  createModel,
  evaluate,
  key,
  // ... other public API imports
} from "@spaceteams/weft";
```

Use the published package name. This validates the public API surface.

## Common Helpers

### `compileOrFail`

Almost every test needs to compile a model. Use this helper:

```ts
function compileOrFail(model: ReturnType<ReturnType<typeof createModel>["build"]>) {
  const result = compileModel(model);
  if (!result.ok) throw new Error(`Compile failed: ${result.issues.map((i) => i.message)}`);
  return result.model;
}
```

Define it at the top of each test file (not shared across files).

## Model Setup Patterns

### Minimal model with inputs and a rule

```ts
const a = key<number>("a");
const b = key<number>("b");
const c = key<number>("c");

const m = createModel();
m.input(a);
m.input(b);
m.rule(
  rule({
    target: c,
    deps: [a, b],
    spec: { op: "sum" },
    eval: (get) => ({ output: get(a) + get(b) }),
  }),
);

const compiled = compileOrFail(m.build());
const result = evaluate(compiled, { a: 10, b: 20 });
```

### Model with layers

```ts
const unitsLayer: LayerEvaluator<string> = {
  name: "units",
  version: "1",
  eval(op, deps, spec) {
    switch (op) {
      case "sum":
        return [...deps.values()][0]; // inherit from first dep
      case "ratio":
        return `(${[...deps.values()].join("/")})`;
      default:
        return undefined;
    }
  },
};

const m = createModel();
m.input(distance);
m.layer(unitsLayer);
m.annotate(distance, "units", "m");
```

### Model with labels (for inspection tests)

```ts
m.input(distance, { label: "Distance" });
m.rule(
  rule({
    target: speed,
    deps: [distance, time],
    spec: { op: "ratio", numerator: "distance", denominator: "time" },
    eval: (get) => ({ output: get(distance) / get(time) }),
  }),
  { label: "Speed" },
);
```

### Model with rule factories (integration tests)

```ts
import { sum, ratio, scale, defaultNumberOps } from "@spaceteams/weft";

const ops = defaultNumberOps;
m.rule(sum(ops, total, [a, b, c]), { label: "Total" });
m.rule(ratio(ops, margin, profit, revenue), { label: "Margin" });
```

## Assertion Patterns

### Value assertions

```ts
expect(result.values.get("speed")).toBe(50);
expect(result.values.get("total")).toBeCloseTo(123.45);
```

### Layer assertions

```ts
expect(result.layers.get("units")?.get("speed")).toEqual({ num: ["m"], denom: ["s"] });
expect(result.layers.get("units")?.get("speed")).toBe("m/s");
```

### Trace step assertions

```ts
const step = result.trace.find((s) => s.target === "speed");
expect(step?.layerOutputs).toEqual({ units: "m/s" });
expect(step?.layerInputs).toEqual({
  units: { distance: "m", time: "s" },
});
```

### ASCII tree snapshots

Use `toMatchInlineSnapshot` for ASCII inspection trees — Vitest auto-fills the content on first run:

```ts
expect(
  inspectionNodeToAscii(inspectTraceTarget(model, result.trace, speed.id), {
    showMeta: true,
    showChange: false,
  }),
).toMatchInlineSnapshot();
```

Run the test once with an empty `toMatchInlineSnapshot()` — Vitest writes the snapshot inline. Then verify the content is correct.

**Options for ASCII rendering:**

| Option | Effect |
|--------|--------|
| `showMeta: true` | Appends `[kind]` after each label |
| `showChange: true` | Shows `= before -> after (changed)` for deltas |
| `showLayers: true` | Appends `{layer: value, ...}` annotations |

### Diff / overlay assertions

```ts
const { deltas, layerDeltas } = diffResults(compiled, before, after);

expect(deltas).toContainEqual({
  key: "speed",
  kind: "changed",
  before: 50,
  after: 100,
});

expect(layerDeltas?.["units"]).toContainEqual({
  key: "speed",
  kind: "changed",
  before: "m/s",
  after: "km/h",
});
```

### Lenient mode (missing inputs)

```ts
const result = evaluate(compiled, { a: 10 }, "lenient"); // b is missing
expect(result.missing.has("b")).toBe(true);
expect(result.values.has("c")).toBe(false); // rule didn't run
```

## Test Organization

Use `describe` for grouping, `it` for individual cases:

```ts
describe("layer evaluation", () => {
  it("propagates layer values through the computation graph", () => { ... });
  it("uses default fallback when eval returns undefined", () => { ... });
  it("is sparse — keys without layer values are absent from the map", () => { ... });
});
```

## Style Rules

- 2-space indent, double quotes, trailing commas, semicolons
- No unused variables (Biome enforces this)
- Tests may use `any` without lint warnings
- Use `const` for all declarations unless reassignment is needed
- Prefer `toEqual` for objects, `toBe` for primitives, `toBeCloseTo` for floats

## Running Tests

```sh
# Single file
cd weft && pnpm run test -- src/evaluate/layer.test.ts

# All library tests
cd weft && pnpm run test

# All tests (library + examples)
pnpm test

# Update inline snapshots
cd weft && pnpm run test -- --update src/inspect/inspect-layers.test.ts
```
