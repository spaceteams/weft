import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    core: "src/core.ts",
    rules: "src/rules.ts",
    model: "src/model/index.ts",
    evaluate: "src/evaluate/index.ts",
    overlay: "src/overlay/index.ts",
    draft: "src/draft/index.ts",
    inspect: "src/inspect/index.ts",
    snapshot: "src/snapshot/index.ts",
    validate: "src/validate/index.ts",
  },
  dts: {
    tsgo: true,
  },
});
