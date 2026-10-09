# @spaceteams/weft-layer-dimensional

## 0.8.0

### Patch Changes

- Updated dependencies [8cb192e]
  - @spaceteams/weft@0.8.0

## 0.7.0

### Minor Changes

- 4b09017: The `match` op no longer propagates a unit, and the layer version is bumped to "2"
  
  `dimensionalLayer` handled `case "match"` with `return firstUnit(deps)` under the comment
  "inherit from the matched output". That was wrong on both counts. Matched row outputs are
  deliberately **not** static deps — see `matchDependencies` in `weft/src/rule/decision-dsl.ts`,
  where the comment reads "Row outputs are NOT static deps — only the matching row's output is
  resolved at eval time". So the `deps` a layer receives for a `match` rule are the row
  *predicates'* sources, and `firstUnit` returned the first of those.
  
  The visible effect: a `match` mapping a EUR-annotated `income` to a **string** tax bracket
  stamped that string with unit `EUR`.
  
  A layer is not told which row matched, and cannot reach the matched row's output key, so no
  correct unit is derivable from what a layer receives. The op now returns `undefined` — the
  layer's own documented sparse behaviour — rather than a plausible-looking wrong answer.
  
  `version` is bumped from `"1"` to `"2"` because that field exists for exactly this case:
  frozen artifacts record layer versions, so a `units` bag written by v1 is not comparable to
  one written by v2.
  
  Making the matched row's unit resolvable would require giving layers the full layer map
  rather than just their deps' values. That is a separate, larger change.

### Patch Changes

- Updated dependencies [4b09017]
- Updated dependencies [4b09017]
- Updated dependencies [4b09017]
  - @spaceteams/weft@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [5e6865c]
  - @spaceteams/weft@0.6.0

## 0.2.0

### Minor Changes

- 1e4bb46: introduce layers and strip keymeta

### Patch Changes

- Updated dependencies [1e4bb46]
- Updated dependencies [1e4bb46]
- Updated dependencies [1e4bb46]
- Updated dependencies [1e4bb46]
  - @spaceteams/weft@0.5.0
