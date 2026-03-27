import type { AnyKey, Key } from "../key";
import type { Equality, OpsDescriptor, Order } from "../semantics/algebra";
import { type Rule, rule } from ".";
import { type Operand, resolveOperand } from "./operand";

export type EqualityPredicate<T> =
  | {
      source: Key<T>;
      op: "eq";
      right: Operand<T>;
    }
  | {
      source: Key<T>;
      op: "in";
      values: readonly Operand<T>[];
    };

export type OrderedPredicate<T> = {
  source: Key<T>;
  op: "gt" | "gte" | "lt" | "lte";
  right: Operand<T>;
};

export type Predicate<T> = EqualityPredicate<T> | OrderedPredicate<T>;

export type RowId = string;
export type DecisionRow<T, O, P extends Predicate<T> = Predicate<T>> = {
  id: RowId;
  when: readonly P[];
  output: Operand<O>;
  label?: string;
};

export type DecisionTable<T, O, P extends Predicate<T> = Predicate<T>> = {
  name: string;
  rows: readonly DecisionRow<T, O, P>[];
  default?: Operand<O>;
};

export type RequiredOps<T, P extends Predicate<T>> =
  Extract<P, OrderedPredicate<T>> extends never ? Equality<T> : Order<T>;
function evalPredicate<T, P extends Predicate<T>>(
  p: P,
  ops: RequiredOps<T, P>,
  get: (k: Key<T>) => T,
) {
  if (p.op === "in") {
    return p.values.some((v) => ops.eq(get(p.source), resolveOperand(v, get)));
  } else {
    const left = get(p.source);
    const right = resolveOperand(p.right, get);
    switch (p.op) {
      case "eq":
        return ops.eq(get(p.source), right);
      case "gt":
        return (ops as Order<T>).compare(left, right) > 0;
      case "gte":
        return (ops as Order<T>).compare(left, right) >= 0;
      case "lt":
        return (ops as Order<T>).compare(left, right) < 0;
      case "lte":
        return (ops as Order<T>).compare(left, right) <= 0;
    }
  }
}

function predicateDependencies<T>(p: Predicate<T>): readonly Key<T>[] {
  if ("right" in p && p.right.__kind === "key") {
    return [p.source, p.right];
  }
  return [p.source];
}

function decisionDependencies<T, O, P extends Predicate<T>>(
  table: DecisionTable<T, O, P>,
): readonly AnyKey[] {
  const deps = new Map<string, AnyKey>();

  for (const row of table.rows) {
    for (const predicate of row.when) {
      for (const dep of predicateDependencies(predicate as Predicate<T>)) {
        deps.set(dep.id, dep);
      }
    }
  }

  if (table.default?.__kind === "key") {
    deps.set(table.default.id, table.default);
  }

  return [...deps.values()];
}

export type DecisionTableTraceDetail = {
  op: "decision";
  tableName: string;
  matchedRowId?: RowId;
  matchedRowLabel?: RowId;
  usedDefault: boolean;
};
export type DecisionTableSpec = {
  op: "decision";
  opsDescriptor: OpsDescriptor;
  table: DecisionTable<unknown, unknown>;
};
function toSpec(ops: OpsDescriptor, table: DecisionTable<unknown, unknown>): DecisionTableSpec {
  const spec: DecisionTableSpec = {
    op: "decision",
    opsDescriptor: { family: ops.family, version: ops.version },
    table: {
      name: table.name,
      rows: table.rows,
    },
  };
  if (table.default) {
    spec.table.default = table.default;
  }
  return spec;
}

export function decision<T, O, P extends Predicate<T>>(
  ops: OpsDescriptor & RequiredOps<T, P>,
  target: Key<O>,
  table: DecisionTable<T, O, P>,
): Rule<O> {
  return rule({
    target,
    spec: toSpec(ops, table),
    deps: decisionDependencies(table),
    eval: (get) => {
      for (const row of table.rows) {
        if (row.when.every((p) => evalPredicate(p, ops, get))) {
          const output = resolveOperand(row.output, get);
          const detail: DecisionTableTraceDetail = {
            op: "decision",
            tableName: table.name,
            matchedRowId: row.id,
            matchedRowLabel: row.label,
            usedDefault: false,
          };
          return { output, detail };
        }
      }
      if (table.default === undefined) {
        throw new Error(`No matching row found for decision table ${table.name}`);
      }
      const output = resolveOperand(table.default, get);
      const detail: DecisionTableTraceDetail = {
        op: "decision",
        tableName: table.name,
        usedDefault: true,
      };
      return { output, detail };
    },
  });
}
