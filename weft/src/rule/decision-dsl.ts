import type { AnyKey, Key } from "../key";
import type { Equality, Order } from "../semantics/algebra";
import { type Rule, rule } from ".";
import { type Operand, resolveOperand } from "./operand";

// ---------------------------------------------------------------------------
// Built-in default ops for common types
// ---------------------------------------------------------------------------

const defaultEq: Equality<unknown> = { eq: Object.is };

const defaultNumberOrder: Order<number> = {
  eq: (a, b) => a === b,
  compare: (a, b) => (a < b ? -1 : a > b ? 1 : 0),
};

const defaultStringOrder: Order<string> = {
  eq: (a, b) => a === b,
  compare: (a, b) => (a < b ? -1 : a > b ? 1 : 0),
};

// ---------------------------------------------------------------------------
// TypedPredicate — a predicate that carries its own comparison logic
// ---------------------------------------------------------------------------

export type TypedPredicate = {
  /** The source key this predicate reads from */
  readonly source: AnyKey;
  /** Additional key dependencies (e.g. when comparing against another key) */
  readonly deps: readonly AnyKey[];
  /** Evaluate this predicate given a resolver */
  readonly test: (get: <T>(k: Key<T>) => T) => boolean;
  /** Serializable descriptor for inspection/spec */
  readonly descriptor: PredicateDescriptor;
};

export type PredicateDescriptor =
  | { readonly op: "eq"; readonly source: string; readonly right: Operand<unknown> }
  | { readonly op: "neq"; readonly source: string; readonly right: Operand<unknown> }
  | { readonly op: "in"; readonly source: string; readonly values: readonly Operand<unknown>[] }
  | { readonly op: "gt"; readonly source: string; readonly right: Operand<unknown> }
  | { readonly op: "gte"; readonly source: string; readonly right: Operand<unknown> }
  | { readonly op: "lt"; readonly source: string; readonly right: Operand<unknown> }
  | { readonly op: "lte"; readonly source: string; readonly right: Operand<unknown> }
  | {
      readonly op: "between";
      readonly source: string;
      readonly min: Operand<unknown>;
      readonly max: Operand<unknown>;
    };

// ---------------------------------------------------------------------------
// when() — fluent predicate builder
// ---------------------------------------------------------------------------

export type WhenBuilder<T> = {
  /** Equality — uses Object.is by default, or custom eq */
  eq(right: T | Key<T>, ops?: Equality<T>): TypedPredicate;
  /** Not equal */
  neq(right: T | Key<T>, ops?: Equality<T>): TypedPredicate;
  /** Membership — value is one of the given set */
  in(values: readonly (T | Key<T>)[], ops?: Equality<T>): TypedPredicate;
  /** Greater than — requires Order<T> or uses default for number/string */
  gt(right: T | Key<T>, ops?: Order<T>): TypedPredicate;
  /** Greater than or equal */
  gte(right: T | Key<T>, ops?: Order<T>): TypedPredicate;
  /** Less than */
  lt(right: T | Key<T>, ops?: Order<T>): TypedPredicate;
  /** Less than or equal */
  lte(right: T | Key<T>, ops?: Order<T>): TypedPredicate;
  /** Range — min <= value <= max */
  between(min: T | Key<T>, max: T | Key<T>, ops?: Order<T>): TypedPredicate;
};

function toOperand<T>(v: T | Key<T>): Operand<T> {
  if (v !== null && typeof v === "object" && "__kind" in v && v.__kind === "key") {
    return v as Key<T>;
  }
  return { __kind: "value", value: v } as Operand<T>;
}

function operandDeps<T>(operand: Operand<T>): readonly Key<T>[] {
  return operand.__kind === "key" ? [operand] : [];
}

function resolveComparison<T>(right: T | Key<T>): {
  operand: Operand<T>;
  deps: readonly AnyKey[];
} {
  const operand = toOperand(right);
  return { operand, deps: operandDeps(operand) };
}

/**
 * Fluent predicate builder. Creates typed predicates with embedded comparison logic.
 *
 * For `number` and `string` keys, comparison ops are auto-selected when omitted.
 * For custom types, pass ops on the individual predicate method.
 *
 * @example
 * ```ts
 * when(age).gte(65)
 * when(status).eq("active")
 * when(tier).in(["gold", "platinum"])
 * ```
 */
export function when<T>(source: Key<T>): WhenBuilder<T> {
  return {
    eq(right: T | Key<T>, ops?: Equality<T>): TypedPredicate {
      const { operand, deps } = resolveComparison(right);
      const eq = ops ?? (defaultEq as Equality<T>);
      return {
        source,
        deps,
        test: (get) => eq.eq(get(source), resolveOperand(operand, get)),
        descriptor: { op: "eq", source: source.id, right: operand as Operand<unknown> },
      };
    },

    neq(right: T | Key<T>, ops?: Equality<T>): TypedPredicate {
      const { operand, deps } = resolveComparison(right);
      const eq = ops ?? (defaultEq as Equality<T>);
      return {
        source,
        deps,
        test: (get) => !eq.eq(get(source), resolveOperand(operand, get)),
        descriptor: { op: "neq", source: source.id, right: operand as Operand<unknown> },
      };
    },

    in(values: readonly (T | Key<T>)[], ops?: Equality<T>): TypedPredicate {
      const operands = values.map(toOperand);
      const deps = operands.flatMap(operandDeps);
      const eq = ops ?? (defaultEq as Equality<T>);
      return {
        source,
        deps,
        test: (get) => {
          const left = get(source);
          return operands.some((v) => eq.eq(left, resolveOperand(v, get)));
        },
        descriptor: {
          op: "in",
          source: source.id,
          values: operands as Operand<unknown>[],
        },
      };
    },

    gt(right: T | Key<T>, ops?: Order<T>): TypedPredicate {
      const { operand, deps } = resolveComparison(right);
      const order = ops ?? inferOrder<T>();
      return {
        source,
        deps,
        test: (get) => order.compare(get(source), resolveOperand(operand, get)) > 0,
        descriptor: { op: "gt", source: source.id, right: operand as Operand<unknown> },
      };
    },

    gte(right: T | Key<T>, ops?: Order<T>): TypedPredicate {
      const { operand, deps } = resolveComparison(right);
      const order = ops ?? inferOrder<T>();
      return {
        source,
        deps,
        test: (get) => order.compare(get(source), resolveOperand(operand, get)) >= 0,
        descriptor: { op: "gte", source: source.id, right: operand as Operand<unknown> },
      };
    },

    lt(right: T | Key<T>, ops?: Order<T>): TypedPredicate {
      const { operand, deps } = resolveComparison(right);
      const order = ops ?? inferOrder<T>();
      return {
        source,
        deps,
        test: (get) => order.compare(get(source), resolveOperand(operand, get)) < 0,
        descriptor: { op: "lt", source: source.id, right: operand as Operand<unknown> },
      };
    },

    lte(right: T | Key<T>, ops?: Order<T>): TypedPredicate {
      const { operand, deps } = resolveComparison(right);
      const order = ops ?? inferOrder<T>();
      return {
        source,
        deps,
        test: (get) => order.compare(get(source), resolveOperand(operand, get)) <= 0,
        descriptor: { op: "lte", source: source.id, right: operand as Operand<unknown> },
      };
    },

    between(min: T | Key<T>, max: T | Key<T>, ops?: Order<T>): TypedPredicate {
      const minRes = resolveComparison(min);
      const maxRes = resolveComparison(max);
      const deps = [...minRes.deps, ...maxRes.deps];
      const order = ops ?? inferOrder<T>();
      return {
        source,
        deps,
        test: (get) => {
          const v = get(source);
          return (
            order.compare(v, resolveOperand(minRes.operand, get)) >= 0 &&
            order.compare(v, resolveOperand(maxRes.operand, get)) <= 0
          );
        },
        descriptor: {
          op: "between",
          source: source.id,
          min: minRes.operand as Operand<unknown>,
          max: maxRes.operand as Operand<unknown>,
        },
      };
    },
  };
}

/**
 * Infer a default Order for number/string. Throws at runtime if the type
 * cannot be inferred (caller should provide explicit ops).
 */
function inferOrder<T>(): Order<T> {
  // We return a lazy proxy that inspects the first argument at call time
  // to determine which built-in order to use.
  return {
    eq(a: T, b: T): boolean {
      if (typeof a === "number" && typeof b === "number") {
        return defaultNumberOrder.eq(a, b);
      }
      if (typeof a === "string" && typeof b === "string") {
        return defaultStringOrder.eq(a as unknown as string, b as unknown as string);
      }
      return Object.is(a, b);
    },
    compare(a: T, b: T): -1 | 0 | 1 {
      if (typeof a === "number" && typeof b === "number") {
        return defaultNumberOrder.compare(a, b);
      }
      if (typeof a === "string" && typeof b === "string") {
        return defaultStringOrder.compare(a as unknown as string, b as unknown as string);
      }
      throw new Error(
        "Cannot infer comparison order for non-number/non-string types. " +
          "Please provide explicit ops.",
      );
    },
  } as Order<T>;
}

// ---------------------------------------------------------------------------
// match() — improved decision factory
// ---------------------------------------------------------------------------

export type MatchRow<O> = {
  readonly id: string;
  readonly when: readonly TypedPredicate[];
  readonly output: Operand<O>;
  readonly label?: string;
};

export type MatchTableConfig<O> = {
  readonly name: string;
  readonly rows: readonly MatchRow<O>[];
  readonly default?: Operand<O>;
};

export type MatchSpec = {
  readonly op: "match";
  readonly tableName: string;
  readonly rows: readonly {
    readonly id: string;
    readonly predicates: readonly PredicateDescriptor[];
    readonly output: Operand<unknown>;
    readonly label?: string;
  }[];
  readonly default?: Operand<unknown>;
};

export type MatchTraceDetail = {
  readonly op: "match";
  readonly tableName: string;
  readonly matchedRowId?: string;
  readonly matchedRowLabel?: string;
  readonly usedDefault: boolean;
};

function matchDependencies<O>(config: MatchTableConfig<O>): readonly AnyKey[] {
  const deps = new Map<string, AnyKey>();

  for (const row of config.rows) {
    for (const predicate of row.when) {
      deps.set(predicate.source.id, predicate.source);
      for (const dep of predicate.deps) {
        deps.set(dep.id, dep);
      }
    }
    // Row outputs are NOT static deps — only the matching row's output is
    // resolved at eval time, so unused outputs don't need to be present.
  }

  if (config.default?.__kind === "key") {
    deps.set(config.default.id, config.default);
  }

  return [...deps.values()];
}

function matchToSpec<O>(config: MatchTableConfig<O>): MatchSpec {
  const spec: MatchSpec = {
    op: "match",
    tableName: config.name,
    rows: config.rows.map((row) => ({
      id: row.id,
      predicates: row.when.map((p) => p.descriptor),
      output: row.output as Operand<unknown>,
      ...(row.label !== undefined ? { label: row.label } : {}),
    })),
    ...(config.default !== undefined ? { default: config.default as Operand<unknown> } : {}),
  };
  return spec;
}

/**
 * Creates a decision rule using the typed predicate DSL.
 *
 * Predicates carry their own comparison logic, so
 * mixed-type conditions work naturally:
 *
 * @example
 * ```ts
 * import { match, when, key, value } from "@spaceteams/weft";
 *
 * const age = key<number>("age");
 * const status = key<string>("status");
 * const discount = key<number>("discount");
 *
 * m.rule(match(discount, {
 *   name: "discount-table",
 *   rows: [
 *     { id: "senior", when: [when(age).gte(65), when(status).eq("active")], output: value(0.2) },
 *     { id: "student", when: [when(age).lt(25)], output: value(0.15) },
 *   ],
 *   default: value(0),
 * }));
 * ```
 */
export function match<O>(target: Key<O>, config: MatchTableConfig<O>): Rule<O> {
  return rule({
    target,
    spec: matchToSpec(config) as unknown as Record<string, unknown>,
    deps: matchDependencies(config),
    eval: (get) => {
      for (const row of config.rows) {
        if (row.when.every((p) => p.test(get))) {
          const output = resolveOperand(row.output, get);
          const detail: MatchTraceDetail = {
            op: "match",
            tableName: config.name,
            matchedRowId: row.id,
            matchedRowLabel: row.label,
            usedDefault: false,
          };
          return { output, detail };
        }
      }
      if (config.default === undefined) {
        throw new Error(`No matching row found in match table "${config.name}"`);
      }
      const output = resolveOperand(config.default, get);
      const detail: MatchTraceDetail = {
        op: "match",
        tableName: config.name,
        usedDefault: true,
      };
      return { output, detail };
    },
  });
}

// ---------------------------------------------------------------------------
// switchOn() — single-source equality shorthand
// ---------------------------------------------------------------------------

export type SwitchCasesRecord<O> = Record<string, Operand<O>>;
export type SwitchCasesArray<T, O> = readonly {
  readonly match: T | readonly T[];
  readonly output: Operand<O>;
}[];

export type SwitchOnConfig<T, O> = {
  readonly name: string;
  readonly cases: SwitchCasesRecord<O> | SwitchCasesArray<T, O>;
  readonly default?: Operand<O>;
  readonly ops?: Equality<T>;
};

/**
 * Single-source decision shorthand. Maps one input key to an output via equality matching.
 *
 * @example
 * ```ts
 * import { switchOn, key, value } from "@spaceteams/weft";
 *
 * const category = key<string>("category");
 * const basePrice = key<number>("base_price");
 *
 * m.rule(switchOn(category, basePrice, {
 *   name: "category-pricing",
 *   cases: {
 *     standard: value(100),
 *     premium: value(250),
 *     enterprise: value(500),
 *   },
 *   default: value(100),
 * }));
 * ```
 */
export function switchOn<T, O>(
  source: Key<T>,
  target: Key<O>,
  config: SwitchOnConfig<T, O>,
): Rule<O> {
  const rows = buildSwitchRows(source, config);
  return match(target, {
    name: config.name,
    rows,
    default: config.default,
  });
}

function buildSwitchRows<T, O>(
  source: Key<T>,
  config: SwitchOnConfig<T, O>,
): readonly MatchRow<O>[] {
  const ops = config.ops;

  if (Array.isArray(config.cases)) {
    // Array form: { match: T | T[], output }[]
    return (config.cases as SwitchCasesArray<T, O>).map((c, i) => {
      const matches = Array.isArray(c.match) ? c.match : [c.match];
      const predicate =
        matches.length === 1
          ? when(source).eq(matches[0] as T, ops)
          : when(source).in(matches as readonly (T | Key<T>)[], ops);
      return {
        id: `case-${i}`,
        when: [predicate],
        output: c.output,
      };
    });
  }

  // Record form: { [caseValue]: output }
  return Object.entries(config.cases as SwitchCasesRecord<O>).map(([caseValue, output]) => ({
    id: caseValue,
    when: [when(source).eq(caseValue as T, ops)],
    output,
  }));
}

// ---------------------------------------------------------------------------
// rangeSwitch() — numeric range lookup
// ---------------------------------------------------------------------------

export type RangeSwitchConfig<O> = {
  readonly name: string;
  readonly ranges: readonly { readonly below: number; readonly output: Operand<O> }[];
  readonly default: Operand<O>;
};

/**
 * Numeric range lookup. Maps a numeric source to an output based on ascending thresholds.
 *
 * Each range fires if `source < below`. Ranges are evaluated in order (should be ascending).
 * Falls through to `default` if no range matches.
 *
 * @example
 * ```ts
 * import { rangeSwitch, key, value } from "@spaceteams/weft";
 *
 * const income = key<number>("income");
 * const taxBracket = key<string>("tax_bracket");
 *
 * m.rule(rangeSwitch(income, taxBracket, {
 *   name: "tax-brackets",
 *   ranges: [
 *     { below: 10_000, output: value("exempt") },
 *     { below: 50_000, output: value("standard") },
 *     { below: 100_000, output: value("elevated") },
 *   ],
 *   default: value("maximum"),
 * }));
 * ```
 */
export function rangeSwitch<O>(
  source: Key<number>,
  target: Key<O>,
  config: RangeSwitchConfig<O>,
): Rule<O> {
  const rows: MatchRow<O>[] = config.ranges.map((range) => ({
    id: `range-below-${range.below}`,
    when: [when(source).lt(range.below)],
    output: range.output,
    label: `< ${range.below}`,
  }));

  return match(target, {
    name: config.name,
    rows,
    default: config.default,
  });
}
