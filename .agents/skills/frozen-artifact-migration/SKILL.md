---
name: frozen-artifact-migration
description: Add a new frozen artifact version migration for weft. Use when changing FrozenEvaluatedDraft or FrozenModel types in a way that affects the serialized shape.
---

# Frozen Artifact Migration

When adding or changing fields on `FrozenEvaluatedDraft` or `FrozenModel`, you must bump the frozen artifact version and write a migration so older artifacts can be read by newer code.

## Steps

### 1. Bump `CURRENT_FROZEN_VERSION`

Edit `weft/weft/src/draft/freeze/version.ts`:

```ts
export const CURRENT_FROZEN_VERSION = <N+1>;
```

### 2. Create the migration file

Create `weft/weft/src/draft/freeze/migrations/v<N>-to-v<N+1>.ts`:

```ts
/**
 * v<N> → v<N+1>:
 * - <describe what changed>
 */
export function migrateV<N>toV<N+1>(artifact: Record<string, unknown>): Record<string, unknown> {
  return {
    ...artifact,
    version: <N+1>,
    // Transform or add fields here. If the new field is optional and simply
    // absent on old artifacts, no transformation is needed beyond the version bump.
  };
}
```

Naming convention: `migrateV0toV1`, `migrateV1toV2`, `migrateV2toV3`, etc.

### 3. Register the migration

Edit `weft/weft/src/draft/freeze/migrate.ts`:

1. Add the import:
   ```ts
   import { migrateV<N>toV<N+1> } from "./migrations/v<N>-to-v<N+1>";
   ```
2. Add the entry to the `migrations` record:
   ```ts
   const migrations: Record<number, Migration> = {
     0: migrateV0toV1,
     1: migrateV1toV2,
     // ...
     <N>: migrateV<N>toV<N+1>,
   };
   ```

### 4. Update the types

- **`FrozenEvaluatedDraft`** in `weft/weft/src/draft/freeze/freeze-evaluated-draft.ts`
- **`FrozenModel`** in `weft/weft/src/model/freeze-model.ts`

New optional fields are backward-compatible (old artifacts simply lack them). Required field changes need data migration in step 2.

### 5. Add a test fixture (if data transforms)

If the migration transforms data (not just adds an optional field):
1. Create a fixture in `weft/weft/src/draft/freeze/__fixtures__/v<N>-evaluated.json`
2. Add a round-trip test in `weft/weft/src/draft/freeze/freeze-migration.test.ts`

### 6. Validate

```sh
pnpm check
```

## Current State

Check the current version:
```sh
cat weft/weft/src/draft/freeze/version.ts
```

List existing migrations:
```sh
ls weft/weft/src/draft/freeze/migrations/
```

## Design Rules

- New **optional** fields are always backward-compatible — the migration just bumps the version.
- New **required** fields need a default value in the migration.
- Field **renames** need explicit key remapping in the migration.
- Field **removals** should be preserved for one version (old code may still read them).
- All frozen values must be `CanonicalJson` (use `canonicalize()` or a codec).
