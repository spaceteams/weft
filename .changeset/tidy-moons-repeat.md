---
"@spaceteams/weft": minor
---

`parseFrozenArtifact` now validates the artifact's structure

`parseFrozenArtifact` migrated the artifact and then returned it via an unchecked cast
(`parse.ts`). `migrateFrozenArtifact` only inspects the `version` field, so an artifact that
claimed the current version but was otherwise malformed — a missing `trace`, a `deltas` array
of strings, a `Date` in `values` — migrated "successfully" and was handed back typed as a
`FrozenEvaluatedDraft`. The failure then surfaced far from its cause, in whatever downstream
code first touched the bad field.

For a library whose stated purpose is reading artifacts across process boundaries and deploys,
that is the wrong failure mode. Validation now runs after migration and throws:

```
Frozen artifact is malformed:
- trace: expected an array, got undefined
- draftId: expected a string, got undefined
```

Every problem is reported in one message rather than failing on the first, so a single round
trip surfaces all of them.

New exports:

- `validateFrozenArtifact(artifact)` returns `string[]` — empty when well formed. Use it to
  decide whether a cached copy should be re-fetched, without throwing.
- `frozenArtifactErrorMessage(problems)` formats the throwable message.

Canonicalizability is part of validation, so `undefined`, circular references, and other
non-serializable content are caught — and the error names the offending path, e.g.
`Unsupported value for canonicalization: undefined (at values.total)`.

This is a behaviour change for anyone currently round-tripping a subtly malformed artifact:
they will now get an exception rather than a confusing downstream crash. That is the intent.
`migrateFrozenArtifact` remains exported and unvalidated for callers who genuinely want the raw
migrated shape.

No frozen artifact version bump — nothing about the serialized shape changed.
