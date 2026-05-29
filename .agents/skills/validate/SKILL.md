---
name: validate
description: Run the full weft CI validation pipeline (test, lint, format, typecheck, build). Use after completing a set of changes to verify everything passes.
---

# Validate Changes

Run the full CI check pipeline to verify changes are correct.

## Full Pipeline

From the **repo root** (`weft/`):

```sh
pnpm check
```

This runs (via Turborepo, in dependency order):
1. `test` — Vitest in both `weft/` and `examples/`
2. `lint` — Biome check
3. `format:check` — Biome format verification
4. `typecheck` — `tsc --noEmit`
5. `build` — tsdown

Always use `timeout_ms: 30000` when calling this command.

## Targeted Validation (start specific, widen)

When validating a focused change, start narrow:

### 1. Run a single test file

```sh
cd weft && pnpm run test -- src/evaluate/layer.test.ts
```

### 2. Run the library tests

```sh
cd weft && pnpm run test
```

### 3. Run typecheck on the library

```sh
cd weft && pnpm run typecheck
```

### 4. Run lint on the library

```sh
cd weft && pnpm run lint
```

### 5. Full pipeline

```sh
pnpm check
```

## Interpreting Failures

### Test failures

Look at the test name and assertion. Vitest outputs clear diffs. Fix the code or update the test expectation.

### Typecheck failures

TypeScript errors include file path, line number, and error code. Common issues:
- **TS2345** (type not assignable) — often variance issues with generic types like `LayerEvaluator<T>`. Consider using `any` for type-erased storage with a `biome-ignore` comment.
- **TS2304** (cannot find name) — missing import.

### Lint failures

Run `cd weft && pnpm run lint:fix` to auto-fix. See the `lint-fix` skill for manual fixes.

### Build failures

Usually caused by typecheck errors. Fix those first.

## Success Criteria

The output should end with:

```
 Tasks:    7 successful, 7 total
```

Any `Failed:` line means something broke. The task name tells you which package and step failed (e.g., `@spaceteams/weft#lint`).
