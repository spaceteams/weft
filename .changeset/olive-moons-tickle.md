---
"@spaceteams/weft": patch
---

Fix `match()` emitting `undefined` into trace detail, which made label-less match rows impossible to freeze

`match()` wrote `matchedRowLabel: row.label` unconditionally, producing an own property
whose value was `undefined` when the row had no label. `canonicalizeTraceStep` iterates
`Object.entries(detail)` — which includes `undefined`-valued keys — and `canonicalize()`
rejects `undefined`, so `freezeEvaluatedDraft` threw
`Unsupported value for canonicalization: undefined`.

This was not hypothetical: `switchOn()` builds its rows without labels in both the
record-form and array-form case shapes, so **every model using `switchOn` failed to
freeze**. Only evaluation and inspection were affected, which is why it went unnoticed —
`inspection-node-to-ascii` uses `??` and fell back to `matchedRowId`, and
`examples/src/tarifierung.test.ts` uses label-less match rows but never freezes.

`match()` now omits the property when there is no label, mirroring what `matchToSpec`
already did on the spec path. `matchedRowLabel` remains optional on `MatchTraceDetail`.
No frozen artifact version bump: label-less matches could not freeze at all before, so no
existing artifact carries the field.

Canonicalization failures also now name the offending location. `canonicalize` takes an
optional `path` that is threaded through the recursion and appended to the error message,
so a failure reads `Unsupported value for canonicalization: undefined (at trace.out.detail.mode)`
instead of giving no positional context at all. The call sites that freeze artifacts label
their paths (`base.*`, `overlay.*`, `effective.*`, `values.*`, `deltas.*`, `layers.*`,
`trace.<target>.*`). The added parameter is optional, so this is not a breaking change.
