# @spaceteams/weft

> Turns business logic into inspectable computation graphs.

weft is a typed computation model library for overlay-based what-if analysis. Define a graph of typed inputs and computed rules, then explore "what if we changed X?" scenarios via overlays. Every step is inspectable — trace how values propagate, visualize dependency trees, and explain diffs in human-readable form.

Designed for a server/client split: models are compiled and evaluated on the server, then frozen into JSON-safe artifacts that clients can hydrate and analyze without round-trips.

## Quick Start

```bash
pnpm add @spaceteams/weft
```

```ts
import {
  key, createModel, compileModel, evaluate,
  sum, defaultNumberOps,
  analyzeDraft, createDraft,
} from "@spaceteams/weft";

// 1. Define your model
const revenue = key<number>("revenue");
const costs = key<number>("costs");
const profit = key<number>("profit");

const m = createModel();
m.input(revenue, { label: "Revenue" });
m.input(costs, { label: "Costs" });
m.rule(sum(defaultNumberOps, profit, [revenue, costs]), { label: "Profit" });
// Note: costs would typically be negative, or you'd use a custom subtraction rule

const { model } = compileModel(m.build()) as { ok: true; model: any };

// 2. Evaluate
const result = evaluate(model, { revenue: 1000, costs: -400 });
console.log(result.values.get("profit")); // 600

// 3. What-if analysis
const draft = createDraft("scenario-1", { revenue: 1000, costs: -400 }, { revenue: 1500 });
const analysis = analyzeDraft(model, draft, "lenient");
// analysis.changes shows: profit changed from 600 to 1100
```

## Packages

| Package | Description |
|---------|-------------|
| [`@spaceteams/weft`](./weft/) | Core library |
| [`@spaceteams/weft-layer-dimensional`](./layers/dimensional/) | SI unit propagation and dimensional analysis layer |
| [`@spaceteams/weft-layer-display-hints`](./layers/display-hints/) | Non-propagating display hints (unit label, semantic type) |
| [`@spaceteams/weft-layer-provenance`](./layers/provenance/) | Source tracking with confidence scoring |
| [`@spaceteams/weft-examples`](./examples/) | Integration tests and usage examples |

## Repository Structure

```
weft/                     ← repo root (pnpm monorepo)
├── weft/                 ← main library package
│   ├── src/
│   │   ├── index.ts          ← main entry
│   │   ├── core.ts           ← keys, values, inputs, facts
│   │   ├── rules.ts          ← rule definitions and factories
│   │   ├── model/            ← model building, compilation, freeze/hydrate
│   │   ├── evaluate/         ← pure evaluation engine
│   │   ├── overlay/          ← overlay evaluation, diffing, explanation
│   │   ├── draft/            ← draft lifecycle, analysis, freeze
│   │   ├── inspect/          ← inspection trees and ASCII rendering
│   │   ├── snapshot/         ← canonical serialization and fingerprinting
│   │   └── validate/         ← schema validation, constraints, Standard Schema
│   └── package.json
├── layers/               ← optional layer packages
│   ├── dimensional/          ← @spaceteams/weft-layer-dimensional
│   ├── display-hints/        ← @spaceteams/weft-layer-display-hints
│   └── provenance/           ← @spaceteams/weft-layer-provenance
├── examples/             ← integration tests
│   └── src/*.test.ts
├── biome.json            ← linter + formatter
├── turbo.json            ← task pipeline
└── pnpm-workspace.yaml
```

## Development

### Prerequisites

- Node.js 22+
- pnpm 10+

### Setup

```bash
git clone https://github.com/spaceteams/weft.git
cd weft
pnpm install
```

### Commands

| Task | Command |
|------|---------|
| Build | `pnpm build` |
| Test | `pnpm test` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Format | `pnpm format` |
| Full CI check | `pnpm check` |

### Toolchain

- **Package manager**: pnpm 10
- **Bundler**: tsdown (rolldown-based, ESM output)
- **TypeScript**: 5.9 (strict mode)
- **Test runner**: Vitest 4
- **Linter/Formatter**: Biome 2.4
- **Monorepo**: Turborepo

## Examples

The [`examples/`](./examples/) package contains runnable integration tests that demonstrate every major feature. See the [examples README](./examples/README.md) for a guided reading order.

Highlights:

| Example | Topics |
|---------|--------|
| [pricing-arithmetic](./examples/src/pricing-arithmetic.test.ts) | Core workflow: keys, model, compile, evaluate, inspect |
| [shorthand-rules](./examples/src/shorthand-rules.test.ts) | `numericRules` shorthand, `algebraicRules`, `value()` literals |
| [rule-factories](./examples/src/rule-factories.test.ts) | Arithmetic, financial, clamping, and conditional rules |
| [non-numeric-rules](./examples/src/non-numeric-rules.test.ts) | Strings, booleans, decision tables, object helpers |
| [finance](./examples/src/finance.test.ts) | Draft analysis: impact, grouped diffs, diff inspection trees |
| [freeze-hydrate](./examples/src/freeze-hydrate.test.ts) | Server→client: freeze, JSON wire, hydrate, client-side inspection |
| [validation](./examples/src/validation.test.ts) | Schema validation, constraints, end-to-end workflow |
| [layers-dimensional](./examples/src/layers-dimensional.test.ts) | Automatic SI unit propagation |
| [layers-provenance](./examples/src/layers-provenance.test.ts) | Source tracking with confidence scoring |

Run them:

```bash
pnpm test          # all packages
cd examples && pnpm run test   # examples only
```

## Documentation

See the [library README](./weft/README.md) for full API documentation including:

- Core concepts (Keys, Rules, Models)
- Evaluation and what-if analysis
- **Layers** — optional parallel evaluation tracks (units, provenance, display hints)
- Server/client freeze/hydrate pattern
- Validation with Standard Schema integration
- Inspection and debugging tools
- Rule factory reference

## License

MIT
