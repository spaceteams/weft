---
name: lint-fix
description: Fix Biome lint and formatting errors in the weft project. Use after making code changes to ensure they pass lint and format checks.
---

# Lint & Format Fix

After making code changes, run Biome to fix lint and formatting issues.

## Quick Fix (preferred)

Run from the **repo root** (`weft/`):

```sh
cd weft && pnpm run lint:fix && pnpm run format
```

This auto-fixes most issues. If errors remain, they require manual intervention.

## Common Issues and Fixes

### Import ordering (`organizeImports`)

Biome enforces sorted imports. The sort order is:
1. `type` imports before value imports from the same module
2. Alphabetical by module path

**Wrong:**
```ts
import { key } from "../key";
import type { KeyId } from "../key";
```

**Right:**
```ts
import type { KeyId } from "../key";
import { key } from "../key";
```

When importing both types and values from the same module, use separate `import` and `import type` statements (required by `verbatimModuleSyntax`):

```ts
import type { CanonicalFactBag } from "../snapshot/canonicalize";
import { canonicalize } from "../snapshot/canonicalize";
```

### `useImportType` — type-only imports must use `import type`

**Wrong:** `import { MyType } from "./types";` (when `MyType` is only used as a type)
**Right:** `import type { MyType } from "./types";`

### `useLiteralKeys` — prefer dot notation for literal string keys

**Wrong:** `obj["foo"]`
**Right:** `obj.foo`

### `noExplicitAny` — avoid `any` where possible

When `any` is genuinely needed (e.g., type-erased layer storage), suppress with:
```ts
// biome-ignore lint: <reason>
```

### Formatting — indentation inside union types

Biome enforces 4-space indent for union members inside a type property:
```ts
export type Example = {
  code:
    | "A"
    | "B"
    | "C";
};
```

## Scope

- Library package: `cd weft && pnpm run lint:fix`
- Full monorepo: `pnpm lint:fix` (from repo root — runs via Turborepo)

## When to Use

Run this after any code edit session, before committing, or when `pnpm check` reports lint/format errors.
