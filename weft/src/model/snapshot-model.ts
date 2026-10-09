import type { CanonicalJson } from "../snapshot/canonicalize";
import { canonicalize } from "../snapshot/canonicalize";
import type { CompiledModel } from ".";
import type { FrozenModel } from "./freeze-model";
import { freezeModel } from "./freeze-model";

/**
 * Project a {@link FrozenModel} into the canonical shape that
 * `modelFingerprint` and `analysisFingerprint` hash.
 *
 * This is the single definition of "model identity". It takes a
 * {@link FrozenModel} rather than a {@link CompiledModel} on purpose: a
 * `CompiledModel` carries live `Rule.eval` functions, so a client holding only
 * frozen data could never call it. Keying off the frozen form means a server
 * and a client derive the same value from the same artifact by construction,
 * and it is what lets {@link snapshotModel} exist at all.
 *
 * Coverage is the whole point — everything structural a frozen model carries
 * reaches the hash:
 *
 * - `version` — the author's behaviour version. Rule arithmetic and
 *   `KeySemantics` callbacks (`normalize`, `eq`, `encode`) are live functions
 *   that never reach a `FrozenModel`, so this is the only channel for them.
 * - `inputKeys`, `orderedRuleTargets`, `ruleSpecs`, `depsByTarget`,
 *   `dependentsByKey`, `keyMeta` — identity, wiring, and topology.
 * - `jsonSchemas`, `keyValueTypes`, `constraints` — validation behaviour.
 * - `layers` — `name`, `version`, and `inputs`. All three: `inputs` are the
 *   `m.annotate` seed payloads that `evaluate` uses to populate each layer's
 *   value map before dispatch, so two models differing only in annotations
 *   produce different layer outputs and must not fingerprint alike. The layer
 *   `version` is load-bearing too — a `units` bag written by v1 is not
 *   comparable to one written by v2.
 *
 * One deliberate inclusion worth flagging: **`jsonSchemas` is the noisiest
 * input**, since bumping the author's schema library moves the fingerprint even
 * though no rule changed. That is still preferable to excluding them, because
 * validation behaviour *is* behaviour and leaving it out reopens the same hole
 * in a smaller form. A `version` bump is the escape hatch for a deliberate
 * schema change.
 *
 * Note the ordering choice: rules are projected in `orderedRuleTargets` order
 * (topological, from `compileModel`), not registration order. `canonicalize`
 * sorts object keys but not array elements, so array order is part of the
 * hash — and topological order is the one that determines evaluation.
 */
export function snapshotFrozenModel(frozen: FrozenModel): CanonicalJson {
  return canonicalize({
    ...(frozen.version !== undefined ? { version: frozen.version } : {}),
    inputKeys: frozen.inputKeys,
    orderedRuleTargets: frozen.orderedRuleTargets,
    rules: frozen.orderedRuleTargets.map((target) => ({
      target,
      spec: frozen.ruleSpecs[target] ?? {},
    })),
    depsByTarget: frozen.depsByTarget,
    dependentsByKey: frozen.dependentsByKey,
    keyMeta: frozen.keyMeta,
    // Every optional field is spread conditionally. `Object.entries` sees own
    // keys whose value is `undefined` and `canonicalize` rejects `undefined`,
    // so writing one unconditionally would throw here.
    ...(frozen.jsonSchemas ? { jsonSchemas: frozen.jsonSchemas } : {}),
    ...(frozen.keyValueTypes ? { keyValueTypes: frozen.keyValueTypes } : {}),
    ...(frozen.constraints ? { constraints: frozen.constraints } : {}),
    ...(frozen.layers
      ? {
          layers: frozen.layers.map((layer) => ({
            name: layer.name,
            version: layer.version,
            // Included, not decoration: these seed each layer's value map in
            // `evaluate`, so they determine layer outputs.
            inputs: layer.inputs,
          })),
        }
      : {}),
  });
}

/**
 * Project a {@link CompiledModel} into the shape hashed by
 * `modelFingerprint`.
 *
 * Delegates to {@link snapshotFrozenModel} so the server and a client holding
 * the same frozen model cannot disagree about a model's identity. Prefer the
 * frozen variant when you have one — it is the only form callable without the
 * live rule functions.
 *
 * Note what this still cannot see: behaviour implemented by functions that do
 * not cross the freeze boundary — rule `eval` arithmetic, and `KeySemantics`
 * `normalize` / `eq` / `encode` / `decode`. These are live functions and never
 * enter a hash. See {@link ModelOptions.version}.
 */
export function snapshotModel(model: CompiledModel): CanonicalJson {
  return snapshotFrozenModel(freezeModel(model));
}
