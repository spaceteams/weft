---
name: add-export
description: Add a new type or module export to the weft package. Handles barrel files, subpath entries, and the main index.ts re-export.
---

# Add a New Export

When adding a new file with public types or functions, you need to wire it into the export chain so consumers can import it.

## Export Chain

```
src/<module>.ts
  ↓ (barrel)
src/<subpath>/index.ts    (e.g., src/evaluate/index.ts)
  ↓ (subpath entry)
src/<subpath-entry>.ts    (e.g., src/core.ts, src/rules.ts)
  ↓ (main entry)
src/index.ts
```

## Steps

### 1. Create the source file

Place it in the appropriate directory based on the API layer:

| Layer | Directory | Subpath entry |
|-------|-----------|---------------|
| Core primitives | `src/` (root) | `src/core.ts` |
| Rules | `src/rule/` | `src/rules.ts` |
| Model | `src/model/` | `src/model/index.ts` |
| Evaluate | `src/evaluate/` | `src/evaluate/index.ts` |
| Overlay | `src/overlay/` | `src/overlay/index.ts` |
| Draft | `src/draft/` | `src/draft/index.ts` |
| Inspect | `src/inspect/` | (no barrel — directly in `src/index.ts`) |
| Snapshot | `src/snapshot/` | `src/snapshot/index.ts` |
| Validate | `src/validate/` | `src/validate/index.ts` |

### 2. Export from the barrel file

If the directory has an `index.ts` barrel, add:
```ts
export * from "./<new-file>";
```

Keep exports alphabetically sorted.

### 3. Export from `src/index.ts`

Add a re-export in the appropriate section of `src/index.ts`:
```ts
export * from "./<path-to-new-file>";
```

The sections in `index.ts` are clearly commented by API layer. Place the export in the matching section.

### 4. Export from the subpath entry (if applicable)

For core types (`src/core.ts`) or rules (`src/rules.ts`), also add the export there.

## Import Style Rules

- Use `export *` for re-exports from barrels and entries.
- Use `import type` for type-only imports (enforced by `verbatimModuleSyntax`).
- Keep imports sorted alphabetically — Biome enforces this.

## Example: Adding a new type to core

1. Create `src/layer-meta.ts`
2. Add to `src/core.ts`: `export * from "./layer-meta";`
3. Add to `src/index.ts` (Core section): `export * from "./layer-meta";`

## Example: Adding a new snapshot utility

1. Create `src/snapshot/canonicalizeLayerValues.ts`
2. Add to `src/snapshot/index.ts`: `export * from "./canonicalizeLayerValues";`
3. Add to `src/index.ts` (Snapshot section): `export * from "./snapshot/canonicalizeLayerValues";`

## Verify

After adding exports, run:
```sh
cd weft && pnpm run typecheck && pnpm run lint
```

This catches unused imports, missing re-exports, and import ordering issues.
