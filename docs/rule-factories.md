# Rule Factories Guide

This document covers all built-in rule factories in `@spaceteams/weft`, how to choose between them, and how to write your own.

## Overview

Rule factories are functions that produce `Rule<T>` instances — typed computation nodes with:

- **`target`** — the key this rule computes
- **`deps`** — keys it reads from
- **`spec`** — a serializable descriptor (appears in trace/inspection)
- **`eval`** — pure function that computes the output

Most factories accept an `ops` parameter implementing algebra traits (e.g., `Additive<T>`, `Order<T>`). Use `defaultNumberOps` for standard numeric computations.

## Algebra Traits

Ops-aware factories are generic over any type that implements the required trait:

| Trait | Methods | Used by |
|-------|---------|---------|
| `Equality<T>` | `eq(a, b)` | All ops-aware rules |
| `Order<T>` | `compare(a, b)` → `-1 \| 0 \| 1` | `minimum`, `maximum`, `abs`, `clamp` |
| `Additive<T>` | `zero()`, `add(a, b)`, `sub(a, b)` | `sum`, `difference`, `negate`, `abs` |
| `Scalable<T, S>` | `one()`, `scale(value, factor)` | `product`, `scale`, `weightedSum` |
| `Divisible<T, R>` | `div(a, b)` | `ratio` |

The built-in `defaultNumberOps` satisfies all traits for `number`.

## Arithmetic Rules (Ops-Aware)

### `sum(ops, target, deps)`

Sum of N dependencies.

```ts
import { sum, defaultNumberOps, key } from "@spaceteams/weft";

const a = key<number>("a");
const b = key<number>("b");
const c = key<number>("c");
const total = key<number>("total");

sum(defaultNumberOps, total, [a, b, c]);
// total = a + b + c
```

**Spec op:** `"sum"` · **Trait:** `Additive<T>`

---

### `difference(ops, target, minuend, subtrahend)`

Subtraction of two keys.

```ts
import { difference, defaultNumberOps, key } from "@spaceteams/weft";

const revenue = key<number>("revenue");
const costs = key<number>("costs");
const profit = key<number>("profit");

difference(defaultNumberOps, profit, revenue, costs);
// profit = revenue - costs
```

**Spec op:** `"difference"` · **Trait:** `Additive<T>`

---

### `negate(ops, target, source)`

Unary negation (zero minus value).

```ts
import { negate, defaultNumberOps, key } from "@spaceteams/weft";

const amount = key<number>("amount");
const negAmount = key<number>("negAmount");

negate(defaultNumberOps, negAmount, amount);
// negAmount = -amount
```

**Spec op:** `"negate"` · **Trait:** `Additive<T>`

---

### `product(ops, target, factors)`

Multiplication of N factors, using `scale` and `one()` as identity.

```ts
import { product, defaultNumberOps, key } from "@spaceteams/weft";

const width = key<number>("width");
const height = key<number>("height");
const depth = key<number>("depth");
const volume = key<number>("volume");

product(defaultNumberOps, volume, [width, height, depth]);
// volume = width × height × depth
```

**Spec op:** `"product"` · **Trait:** `Scalable<T, T>` · **Detail:** `{ factors: T[] }`

---

### `scale(ops, target, input, factor)`

Multiply a value by a factor (potentially different types).

```ts
import { scale, defaultNumberOps, key } from "@spaceteams/weft";

const base = key<number>("base");
const rate = key<number>("rate");
const result = key<number>("result");

scale(defaultNumberOps, result, base, rate);
// result = base × rate
```

**Spec op:** `"scale"` · **Trait:** `Scalable<T, S>`

---

### `ratio(ops, target, numerator, denominator)`

Division of two keys.

```ts
import { ratio, defaultNumberOps, key } from "@spaceteams/weft";

const profit = key<number>("profit");
const revenue = key<number>("revenue");
const margin = key<number>("margin");

ratio(defaultNumberOps, margin, profit, revenue);
// margin = profit / revenue
```

**Spec op:** `"ratio"` · **Trait:** `Divisible<T, R>`

---

### `minimum(ops, target, deps)` / `maximum(ops, target, deps)`

Min or max of N keys using `Order<T>.compare`.

```ts
import { minimum, maximum, defaultNumberOps, key } from "@spaceteams/weft";

const a = key<number>("a");
const b = key<number>("b");
const c = key<number>("c");
const lo = key<number>("lo");
const hi = key<number>("hi");

minimum(defaultNumberOps, lo, [a, b, c]);
// lo = min(a, b, c)

maximum(defaultNumberOps, hi, [a, b, c]);
// hi = max(a, b, c)
```

**Spec op:** `"min"` / `"max"` · **Trait:** `Order<T>` · **Detail:** `{ values: T[] }`

Throws if `deps` is empty.

---

### `abs(ops, target, source)`

Absolute value — negates if below zero.

```ts
import { abs, defaultNumberOps, key } from "@spaceteams/weft";

const delta = key<number>("delta");
const absDelta = key<number>("absDelta");

abs(defaultNumberOps, absDelta, delta);
// absDelta = |delta|
```

**Spec op:** `"abs"` · **Trait:** `Order<T> & Additive<T>`

---

### `clamp(ops, target, value, min, max)`

Bounds a value between min and max. Bounds can be literal values or key references (`Operand<T>`).

```ts
import { clamp, defaultNumberOps, key, value } from "@spaceteams/weft";

const score = key<number>("score");
const clamped = key<number>("clamped");

// Literal bounds
clamp(defaultNumberOps, clamped, score, value(0), value(100));

// Dynamic bounds from keys
const minKey = key<number>("minScore");
const maxKey = key<number>("maxScore");
clamp(defaultNumberOps, clamped, score, minKey, maxKey);
```

**Spec op:** `"clamp"` · **Trait:** `Order<T>` · **Detail:** `{ value, min, max, clamped: boolean }`

---

### `weightedSum(ops, target, entries)`

Weighted sum with per-entry weights (each weight is an `Operand<S>`).

```ts
import { weightedSum, defaultNumberOps, key, value } from "@spaceteams/weft";

const revenue = key<number>("revenue");
const cost = key<number>("cost");
const profit = key<number>("profit");

weightedSum(defaultNumberOps, profit, [
  { key: revenue, weight: value(1) },
  { key: cost, weight: value(-1) },
]);
// profit = revenue × 1 + cost × (−1)
```

**Spec op:** `"weighted-sum"` · **Trait:** `Additive<T> & Scalable<T, S>`

---

## Number-Specific Rules

These don't take `ops` — they work directly with `number`.

### `round(target, source, options?)`

Rounds a numeric value with configurable mode and decimal precision.

```ts
import { round, key } from "@spaceteams/weft";

const raw = key<number>("raw");
const rounded = key<number>("rounded");

round(rounded, raw);                              // Math.round to integer
round(rounded, raw, { mode: "floor" });           // Math.floor
round(rounded, raw, { mode: "ceil", decimals: 2 }); // ceil to 2 decimal places
round(rounded, raw, { mode: "trunc" });           // truncate toward zero
```

**Options:**
- `mode` — `"round"` (default) | `"floor"` | `"ceil"` | `"trunc"`
- `decimals` — number of decimal places (default: `0`)

**Spec op:** `"round"` · **Detail:** `{ raw, mode, decimals }`

---

### `futureValue(target, rate, nper, pmt, pv)`

Financial future value: `FV = PV × (1+r)^n + PMT × ((1+r)^n − 1) / r`

Handles `r = 0` as special case: `FV = PV + PMT × n`

```ts
import { futureValue, key } from "@spaceteams/weft";

const rate = key<number>("rate");
const nper = key<number>("nper");
const pmt = key<number>("pmt");
const pv = key<number>("pv");
const fv = key<number>("fv");

futureValue(fv, rate, nper, pmt, pv);
```

**Spec op:** `"future-value"`

---

### `presentValue(target, rate, nper, pmt, fv)`

Financial present value: `PV = FV / (1+r)^n − PMT × ((1+r)^n − 1) / (r × (1+r)^n)`

Handles `r = 0` as special case: `PV = FV − PMT × n`

```ts
import { presentValue, key } from "@spaceteams/weft";

const rate = key<number>("rate");
const nper = key<number>("nper");
const pmt = key<number>("pmt");
const fv = key<number>("fv");
const pv = key<number>("pv");

presentValue(pv, rate, nper, pmt, fv);
```

**Spec op:** `"present-value"`

---

### `annuityPayment(target, rate, nper, pv)`

Financial annuity payment: `PMT = PV × r × (1+r)^n / ((1+r)^n − 1)`

Handles `r = 0` as special case: `PMT = PV / n`

```ts
import { annuityPayment, key } from "@spaceteams/weft";

const rate = key<number>("rate");
const nper = key<number>("nper");
const pv = key<number>("pv");
const payment = key<number>("payment");

annuityPayment(payment, rate, nper, pv);
```

**Spec op:** `"annuity-payment"`

---

## Logic & Control Flow

### `conditional(target, condition, then, otherwise)`

If/then/else branching based on a boolean key. Branches are `Operand<T>` — either literal values or key references.

```ts
import { conditional, key, value } from "@spaceteams/weft";

const isEligible = key<boolean>("isEligible");
const bonus = key<number>("bonus");

// Literal branches
conditional(bonus, isEligible, value(500), value(0));

// Key branches
const highBonus = key<number>("highBonus");
const lowBonus = key<number>("lowBonus");
conditional(bonus, isEligible, highBonus, lowBonus);
```

**Spec op:** `"conditional"` · **Detail:** `{ condition: boolean }`

---

### `decision(target, deps, table)`

Decision table with predicate-based row matching. See existing documentation for full details.

**Spec op:** `"decision"`

---

### `match(target, config)` — Typed Predicate Decision Table

Decision table using the typed predicate DSL with `when()`. Supports mixed-type conditions naturally.

```ts
import { match, when, key, value } from "@spaceteams/weft";

const age = key<number>("age");
const status = key<string>("status");
const discount = key<number>("discount");

match(discount, {
  name: "discount-table",
  rows: [
    { id: "senior", when: [when(age).gte(65), when(status).eq("active")], output: value(0.2) },
    { id: "student", when: [when(age).lt(25)], output: value(0.15) },
  ],
  default: value(0),
});
```

The `when()` builder supports: `eq`, `neq`, `in`, `gt`, `gte`, `lt`, `lte`, `between`.

**Spec op:** `"match"`

---

### `switchOn(source, target, config)` — Single-Source Switch

Maps one input key to an output via equality matching. Shorthand for common single-column decision tables.

```ts
import { switchOn, key, value } from "@spaceteams/weft";

const category = key<string>("category");
const price = key<number>("price");

switchOn(category, price, {
  name: "pricing",
  cases: { standard: value(100), premium: value(250) },
  default: value(50),
});
```

Also supports array form for multi-value matching:
```ts
switchOn(category, price, {
  name: "pricing",
  cases: [
    { match: ["standard", "basic"], output: value(100) },
    { match: "premium", output: value(250) },
  ],
  default: value(50),
});
```

**Spec op:** `"match"` (delegates to `match()` internally)

---

### `rangeSwitch(source, target, config)` — Numeric Range Lookup

Maps a numeric source to an output based on ascending thresholds. Each range fires if `source < below`.

```ts
import { rangeSwitch, key, value } from "@spaceteams/weft";

const income = key<number>("income");
const bracket = key<string>("bracket");

rangeSwitch(income, bracket, {
  name: "tax-brackets",
  ranges: [
    { below: 10_000, output: value("exempt") },
    { below: 50_000, output: value("standard") },
  ],
  default: value("maximum"),
});
```

**Spec op:** `"match"` (delegates to `match()` internally)

---

## Object & Record Helpers

These rules work with structured/nested data — no algebra traits needed.

### `projection(target, source, field)`

Extract a single field from a record-typed key.

```ts
import { projection, key } from "@spaceteams/weft";

const user = key<{ name: string; age: number }>("user");
const name = key<string>("name");

projection(name, user, "name");
```

**Spec op:** `"project"`

---

### `pick(target, source, fields)`

Extract multiple fields from a record-typed key.

```ts
import { pick, key } from "@spaceteams/weft";

const customer = key<{ name: string; age: number; email: string }>("customer");
const profile = key<{ name: string; email: string }>("profile");

pick(profile, customer, ["name", "email"]);
```

**Spec op:** `"pick"`

---

### `pluck(target, source, path)`

Deep path extraction from nested objects. Accepts dot-notation string or array of segments.

```ts
import { pluck, key } from "@spaceteams/weft";

const config = key<{ pricing: { baseRate: number } }>("config");
const rate = key<number>("rate");

pluck(rate, config, "pricing.baseRate");
// or: pluck(rate, config, ["pricing", "baseRate"]);
```

**Spec op:** `"pluck"`

---

### `compose(target, fields)`

Construct an object from individual keys (fan-in pattern).

```ts
import { compose, key } from "@spaceteams/weft";

const name = key<string>("name");
const age = key<number>("age");
const profile = key<{ name: string; age: number }>("profile");

compose(profile, { name, age });
```

**Spec op:** `"compose"`

---

### `spread(target, sources)`

Shallow-merge multiple object keys into one. Later sources override earlier ones.

```ts
import { spread, key } from "@spaceteams/weft";

const base = key<{ a: number }>("base");
const extra = key<{ b: string }>("extra");
const merged = key<{ a: number; b: string }>("merged");

spread(merged, [base, extra]);
```

**Spec op:** `"spread"`

---

### `mapEntries(target, source, transform, extraDeps?)`

Transform all values in a record-typed key. The transform function receives a `get` resolver for accessing extra dependencies.

```ts
import { mapEntries, key } from "@spaceteams/weft";

const prices = key<Record<string, number>>("prices");
const discounted = key<Record<string, number>>("discounted");
const factor = key<number>("factor");

mapEntries(discounted, prices, (v, get) => v * get(factor), [factor]);
```

**Spec op:** `"mapEntries"`

---

## String Rules

### `concat(target, parts, separator?)`

Concatenate multiple string keys with an optional separator.

```ts
import { concat, key } from "@spaceteams/weft";

const first = key<string>("first");
const last = key<string>("last");
const full = key<string>("full");

concat(full, [first, last], " ");
```

**Spec op:** `"concat"`

---

### `template(target, pattern, deps)`

String interpolation with `{key}` placeholders. Values are coerced via `String()`.

```ts
import { template, key } from "@spaceteams/weft";

const name = key<string>("name");
const count = key<number>("count");
const msg = key<string>("msg");

template(msg, "{name} has {count} items", { name, count });
```

**Spec op:** `"template"`

---

### `format(target, source, formatter)`

Convert any typed value to a display string using a custom formatter function.

```ts
import { format, key } from "@spaceteams/weft";

const amount = key<number>("amount");
const display = key<string>("display");

format(display, amount, (v) => `€${v.toFixed(2)}`);
```

**Spec op:** `"format"` (formatter not serializable, but spec is inspectable)

---

## Boolean Rules

### `logicalAnd(target, deps)` / `logicalOr(target, deps)` / `logicalNot(target, source)`

Boolean logic operations.

```ts
import { logicalAnd, logicalOr, logicalNot, key } from "@spaceteams/weft";

const a = key<boolean>("a");
const b = key<boolean>("b");
const both = key<boolean>("both");
const either = key<boolean>("either");
const notA = key<boolean>("notA");

logicalAnd(both, [a, b]);    // both = a && b
logicalOr(either, [a, b]);   // either = a || b
logicalNot(notA, a);          // notA = !a
```

**Spec ops:** `"and"`, `"or"`, `"not"`

---

### `compare(target, left, right, op)`

Produce a boolean from a comparison. The right operand can be a literal value or key reference.

```ts
import { compare, key, value } from "@spaceteams/weft";

const age = key<number>("age");
const isAdult = key<boolean>("isAdult");

compare(isAdult, age, value(18), "gte");
```

Supported operators: `"eq"`, `"neq"`, `"gt"`, `"gte"`, `"lt"`, `"lte"`

**Spec op:** `"compare"`

---

### `coerce(target, source, fn)`

Generic type conversion rule.

```ts
import { coerce, key } from "@spaceteams/weft";

const raw = key<string>("raw");
const parsed = key<number>("parsed");

coerce(parsed, raw, (s) => parseFloat(s));
```

**Spec op:** `"coerce"` (function not serializable, but spec is inspectable)

---

## Ergonomic Helpers

### `numericRules` / `algebraicRules(ops)`

Pre-bound rule factory sets that eliminate the `ops` parameter:

```ts
import { numericRules as n, key } from "@spaceteams/weft";

const a = key<number>("a");
const b = key<number>("b");
const total = key<number>("total");

n.sum(total, [a, b]);        // no ops needed!
n.difference(total, a, b);
n.product(total, [a, b]);
n.scale(total, a, b);
n.ratio(total, a, b);
n.minimum(total, [a, b]);
n.maximum(total, [a, b]);
n.abs(total, a);
n.clamp(total, a, value(0), value(100));
n.weightedSum(total, [{ key: a, weight: value(2) }]);
```

`numericRules` uses `defaultNumberOps`. For custom types, use `algebraicRules(myOps)`.

---

## Inspection & Trace

Every rule factory produces a `spec` with an `op` field that appears in inspection trees:

```
└── Profit [difference] = 50
    ├── Revenue [input] = 200
    └── Costs [input] = 150
```

The `op` value (e.g., `"difference"`, `"product"`, `"min"`) is shown in square brackets. The `detail` object from `eval` is available in `TraceStep.detail` for programmatic access to intermediate values.

## Writing Custom Rule Factories

Follow this pattern to create your own factories:

```ts
import type { Key, KeyId } from "@spaceteams/weft";
import { rule, type Rule } from "@spaceteams/weft";

// 1. Define a spec type (serializable — no functions)
export type MySpec = {
  op: "my-rule";
  source: KeyId;
  config: number;
};

// 2. Export the factory function
export function myRule(
  target: Key<number>,
  source: Key<number>,
  config: number,
): Rule<number> {
  const spec: MySpec = {
    op: "my-rule",
    source: source.id,
    config,
  };
  return rule({
    target,
    spec,
    deps: [source],
    eval: (get) => {
      const v = get(source);
      const output = v * config;
      return { output, detail: { raw: v } };
    },
  });
}
```

**Guidelines:**

1. **Spec must be JSON-serializable** — no functions, no class instances. It appears in frozen artifacts and trace output.
2. **Include an `op` field** — used by inspection for labeling.
3. **List all deps** — the rule engine uses this for topological sorting and change propagation.
4. **Return `{ output }` or `{ output, detail }`** — `detail` is optional and provides extra trace info.
5. **Use algebra traits for generics** — if your rule could work over different numeric types, accept an `ops` parameter.
6. **Use `Operand<T>`** — when a parameter could be either a literal value or a key reference, use `Operand<T>` with `resolveOperand()`.
