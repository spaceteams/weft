import { describe, expect, it } from "vitest";
import { evaluate } from "../evaluate";
import type { KeyId } from "../key";
import { key } from "../key";
import type { LayerEvaluator } from "../layer";
import { compileModel } from "../model/compile-model";
import { createModel } from "../model/create-model";
import type { Change } from "../overlay/explain-diff";
import { rule } from "../rule";
import { inspectDiffTarget } from "./inspect-diff-target";
import { inspectTraceTarget } from "./inspect-trace-target";
import { inspectionNodeToAscii } from "./inspection-node-to-ascii";

function compileOrFail(model: ReturnType<ReturnType<typeof createModel>["build"]>) {
  const result = compileModel(model);
  if (!result.ok) throw new Error(`Compile failed: ${result.issues.map((i) => i.message)}`);
  return result.model;
}

// ── shared model: speed = distance / time ──────────────────────────────

type Unit = { num: string[]; denom: string[] };

const unitsLayer: LayerEvaluator<Unit> = {
  name: "units",
  version: "1",
  eval(op, deps, spec) {
    switch (op) {
      case "ratio": {
        const numUnit = deps.get(spec.numerator as KeyId);
        const denomKey =
          typeof spec.denominator === "string"
            ? (spec.denominator as KeyId)
            : ((spec.denominator as { id: KeyId }).id as KeyId);
        const denomUnit = deps.get(denomKey);
        if (!numUnit || !denomUnit) return undefined;
        return { num: numUnit.num, denom: [...numUnit.denom, ...denomUnit.num] };
      }
      default:
        return undefined;
    }
  },
};

function buildSpeedModel() {
  const distance = key<number>("distance");
  const time = key<number>("time");
  const speed = key<number>("speed");

  const m = createModel();
  m.input(distance, { label: "Distance" });
  m.input(time, { label: "Time" });
  m.layer(unitsLayer);
  m.annotate(distance, "units", { num: ["m"], denom: [] });
  m.annotate(time, "units", { num: ["s"], denom: [] });

  m.rule(
    rule({
      target: speed,
      deps: [distance, time],
      spec: { op: "ratio", numerator: "distance", denominator: { __kind: "key", id: "time" } },
      eval: (get) => ({ output: get(distance) / get(time) }),
    }),
  );

  const compiled = compileOrFail(m.build());
  return { distance, time, speed, compiled };
}

// ── tests ──────────────────────────────────────────────────────────────

describe("inspect layer integration", () => {
  it("inspectTraceTarget populates execution.layers on rule nodes from TraceStep.layerOutputs", () => {
    const { speed, compiled } = buildSpeedModel();
    const result = evaluate(compiled, { distance: 100, time: 2 });

    const tree = inspectTraceTarget(compiled, result.trace, speed.id);

    // The root (speed) is a rule node — it should carry the units layer output
    expect(tree.execution?.layers).toEqual({
      units: { num: ["m"], denom: ["s"] },
    });
  });

  it("inspectTraceTarget populates execution.layers on input nodes from parent TraceStep.layerInputs", () => {
    const { speed, compiled } = buildSpeedModel();
    const result = evaluate(compiled, { distance: 100, time: 2 });

    const tree = inspectTraceTarget(compiled, result.trace, speed.id);

    // Input children of the speed node should carry layer values from the parent's layerInputs
    const distanceNode = tree.children.find((c) => c.key === "distance");
    const timeNode = tree.children.find((c) => c.key === "time");

    expect(distanceNode?.execution?.layers).toEqual({
      units: { num: ["m"], denom: [] },
    });
    expect(timeNode?.execution?.layers).toEqual({
      units: { num: ["s"], denom: [] },
    });
  });

  it("inspectDiffTarget populates execution.layers on both rule and input nodes", () => {
    const { speed, compiled } = buildSpeedModel();
    const result = evaluate(compiled, { distance: 100, time: 2 });

    const changes: Change[] = [
      { delta: { key: "speed" as KeyId, kind: "changed", before: 50, after: 100 } },
    ];

    const tree = inspectDiffTarget(compiled, { trace: result.trace }, changes, speed.id);

    // Rule node layers
    expect(tree.execution?.layers).toEqual({
      units: { num: ["m"], denom: ["s"] },
    });

    // Input node layers
    const distanceNode = tree.children.find((c) => c.key === "distance");
    expect(distanceNode?.execution?.layers).toEqual({
      units: { num: ["m"], denom: [] },
    });
  });

  it("inspectionNodeToAscii renders layer annotations with showLayers: true", () => {
    const { speed, compiled } = buildSpeedModel();
    const result = evaluate(compiled, { distance: 100, time: 2 });

    const tree = inspectTraceTarget(compiled, result.trace, speed.id);
    const ascii = inspectionNodeToAscii(tree, {
      showMeta: false,
      showChange: false,
      showLayers: true,
    });

    expect(ascii).toMatchInlineSnapshot(`
      "└── speed = 50 {units: {"num":["m"],"denom":["s"]}}
          ├── Distance = 100 {units: {"num":["m"],"denom":[]}}
          └── Time = 2 {units: {"num":["s"],"denom":[]}}"
    `);
  });

  it("inspectionNodeToAscii does not render layers when showLayers is false", () => {
    const { speed, compiled } = buildSpeedModel();
    const result = evaluate(compiled, { distance: 100, time: 2 });

    const tree = inspectTraceTarget(compiled, result.trace, speed.id);
    const asciiOff = inspectionNodeToAscii(tree, {
      showMeta: false,
      showChange: false,
      showLayers: false,
    });

    expect(asciiOff).toMatchInlineSnapshot(`
      "└── speed = 50
          ├── Distance = 100
          └── Time = 2"
    `);
  });

  it("inspectionNodeToAscii does not render layers when showLayers is omitted", () => {
    const { speed, compiled } = buildSpeedModel();
    const result = evaluate(compiled, { distance: 100, time: 2 });

    const tree = inspectTraceTarget(compiled, result.trace, speed.id);
    const asciiDefault = inspectionNodeToAscii(tree, {
      showMeta: false,
      showChange: false,
    });

    expect(asciiDefault).toMatchInlineSnapshot(`
      "└── speed = 50
          ├── Distance = 100
          └── Time = 2"
    `);
  });

  it("renders multiple layers on a single node", () => {
    const x = key<number>("x");
    const y = key<number>("y");

    const layer1: LayerEvaluator<number> = {
      name: "confidence",
      version: "1",
      eval(_op, deps) {
        const values = [...deps.values()];
        return values.length > 0 ? Math.min(...values) * 0.9 : undefined;
      },
    };

    const layer2: LayerEvaluator<string> = {
      name: "source",
      version: "1",
      eval() {
        return "computed";
      },
    };

    const m = createModel();
    m.input(x, { label: "X" });
    m.layer(layer1);
    m.layer(layer2);
    m.annotate(x, "confidence", 1.0);
    m.annotate(x, "source", "manual");

    m.rule(
      rule({
        target: y,
        deps: [x],
        spec: { op: "scale", factor: 2 },
        eval: (get) => ({ output: get(x) * 2 }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { x: 5 });

    const tree = inspectTraceTarget(compiled, result.trace, y.id);

    // Rule node should have both layers
    expect(tree.execution?.layers).toEqual({
      confidence: expect.closeTo(0.9),
      source: "computed",
    });

    // ASCII should render both layers
    const ascii = inspectionNodeToAscii(tree, {
      showMeta: false,
      showChange: false,
      showLayers: true,
    });

    expect(ascii).toMatchInlineSnapshot(`
      "└── y = 10 {confidence: 0.9, source: computed}
          └── X = 5 {confidence: 1, source: manual}"
    `);
  });

  it("sparse layers — nodes without layer values don't show annotations", () => {
    const a = key<number>("a");
    const b = key<number>("b");
    const c = key<number>("c");

    const sparseLayer: LayerEvaluator<string> = {
      name: "tag",
      version: "1",
      eval() {
        return undefined;
      },
      // no default — layer is sparse
    };

    const m = createModel();
    m.input(a, { label: "A" });
    m.layer(sparseLayer);
    // only annotate "a", not "b" or "c"
    m.annotate(a, "tag", "annotated");

    m.rule(
      rule({
        target: b,
        deps: [a],
        spec: { op: "identity" },
        eval: (get) => ({ output: get(a) }),
      }),
    );

    m.rule(
      rule({
        target: c,
        deps: [b],
        spec: { op: "identity" },
        eval: (get) => ({ output: get(b) }),
      }),
    );

    const compiled = compileOrFail(m.build());
    const result = evaluate(compiled, { a: 42 });

    const tree = inspectTraceTarget(compiled, result.trace, c.id);

    // Root rule node (c) has no layer output — layer.eval returns undefined, no default
    expect(tree.execution?.layers).toBeUndefined();

    // Intermediate rule node (b) also has no layer output
    const bNode = tree.children.find((ch) => ch.key === "b");
    expect(bNode?.execution?.layers).toBeUndefined();

    // Input node (a) under b should have the annotated layer value
    const aNode = bNode?.children.find((ch) => ch.key === "a");
    expect(aNode?.execution?.layers).toEqual({ tag: "annotated" });

    // ASCII with showLayers: only "a" should show the annotation
    const ascii = inspectionNodeToAscii(tree, {
      showMeta: false,
      showChange: false,
      showLayers: true,
    });

    expect(ascii).toMatchInlineSnapshot(`
      "└── c = 42
          └── b = 42
              └── A = 42 {tag: annotated}"
    `);
  });
});
