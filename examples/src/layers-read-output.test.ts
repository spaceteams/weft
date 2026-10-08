import type { KeyId, LayerEvaluator } from "@spaceteams/weft";
import {
  compileModel,
  createModel,
  defaultNumberOps,
  evaluate,
  evaluateDraft,
  freezeEvaluatedDraft,
  freezeModel,
  hydrateModel,
  inspectionNodeToAscii,
  inspectTraceTarget,
  key,
  rule,
  sum,
} from "@spaceteams/weft";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// A presentation layer that reads the values it annotates.
//
// `eval(op, deps, spec)` receives the rule's computed output, so a layer can
// format, classify, or otherwise interpret that value rather than only reasoning
// about its dependencies. A currency-formatting layer is the motivating case: it
// needs the number in order to render "$1,234.50".
//
// `output` is typed `unknown` — `CompiledModel.ruleByTarget` is a heterogeneous
// `ReadonlyMap<KeyId, Rule<unknown>>`, so the evaluation loop has erased each
// rule's output type before any layer runs. Narrowing is the layer's job.
// ---------------------------------------------------------------------------

const price = key<number>("price");
const quantity = key<number>("quantity");
const total = key<number>("total");
const greeting = key<string>("greeting");

/** Renders a numeric output as a currency string; ignores everything else. */
const moneyLayer: LayerEvaluator<string> = {
  name: "money",
  version: "1",

  eval(_op, _deps, _spec, output): string | undefined {
    if (typeof output !== "number") return undefined;
    return output.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    });
  },
};

const m = createModel();
m.layer(moneyLayer);

m.input(price, { label: "Unit price" });
m.input(quantity, { label: "Quantity" });
m.rule(sum(defaultNumberOps, total, [price, quantity]), { label: "Total" });

// A rule whose output is not a number — the layer must decline it.
m.rule(
  rule({
    target: greeting,
    deps: [total],
    spec: { op: "format" },
    eval: (get) => ({ output: `thanks for ${get(total)}` }),
  }),
);

const compiled = compileModel(m.build());
if (!compiled.ok) throw new Error(compiled.issues.map((i) => i.message).join());
const model = compiled.model;

describe("a layer that reads the computed output", () => {
  it("formats the value it annotates", () => {
    const result = evaluate(model, { price: 1000, quantity: 2 });

    expect(result.values.get("total")).toBe(1002);
    expect(result.layers.get("money")?.get("total")).toBe("$1,002.00");
  });

  it("declines outputs it cannot interpret", () => {
    const result = evaluate(model, { price: 1000, quantity: 2 });

    // Sparse: no money value for a string output, rather than a wrong one.
    expect(result.layers.get("money")?.has("greeting")).toBe(false);
  });

  it("sees the output, not just the dependency layer values", () => {
    // `money` never annotates any input, so `deps` is empty for every rule.
    // It can still produce values purely by reading `output`.
    const result = evaluate(model, { price: 5, quantity: 5 });
    expect(result.layers.get("money")?.get("total")).toBe("$10.00");
  });

  it("carries the output-derived layer value through freeze and hydrate", () => {
    const evaluated = evaluateDraft(
      model,
      { draftId: "money-draft", base: { price: 1000, quantity: 2 }, overlay: {} },
      "lenient",
    );
    const frozenDraft = freezeEvaluatedDraft(model, evaluated);
    const frozenModel = freezeModel(model);

    expect(frozenDraft.layers?.money.total).toBe("$1,002.00");
    expect(frozenDraft.layers?.money.greeting).toBeUndefined();

    // The trace carries the layer output too, so a client can render it.
    const step = frozenDraft.trace.find((t) => t.target === "total");
    expect(step?.layerOutputs).toEqual({ money: "$1,002.00" });
    expect(step?.layerInputs).toBeUndefined();

    const structure = hydrateModel(frozenModel);
    expect(structure.layers?.[0]?.name).toBe("money");

    const ascii = inspectionNodeToAscii(
      inspectTraceTarget(structure, frozenDraft.trace, total.id as KeyId),
      { showMeta: true, showChange: false, showLayers: true },
    );
    expect(ascii).toContain("Total");
  });
});
