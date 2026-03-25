import type { Key } from "../key";
import type { Equality, Order } from "../semantics/algebra";
import { type Rule, rule } from ".";

export type Operand<T> = { kind: "value"; value: T } | { kind: "key"; key: Key<T> };

export type EqualityPredicate<T> =
  | {
      source: Key<T>;
      op: "eq";
      right: Operand<T>;
    }
  | {
      source: Key<T>;
      op: "in";
      values: readonly T[];
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
  then: O;
  label?: string;
};

export type DecisionTable<T, O, P extends Predicate<T> = Predicate<T>> = {
  name: string;
  rows: readonly DecisionRow<T, O, P>[];
  default?: Operand<O>;
};

function resolveOperand<T>(operand: Operand<T>, get: (k: Key<T>) => T): T {
  return operand.kind === "value" ? operand.value : get(operand.key);
}

export type RequiredOps<T, P extends Predicate<T>> =
  Extract<P, OrderedPredicate<T>> extends never ? Equality<T> : Order<T>;
function evalPredicate<T, P extends Predicate<T>>(
  p: P,
  ops: RequiredOps<T, P>,
  get: (k: Key<T>) => T,
) {
  if (p.op === "in") {
    return p.values.some((v) => ops.eq(get(p.source), v));
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
  if ("right" in p && p.right.kind === "key") {
    return [p.source, p.right.key];
  }
  return [p.source];
}

function decisionDependencies<T, O, P extends Predicate<T>>(
  table: DecisionTable<T, O, P>,
): readonly Key<unknown>[] {
  const deps = new Map<string, Key<unknown>>();

  for (const row of table.rows) {
    for (const predicate of row.when) {
      for (const dep of predicateDependencies(predicate as Predicate<T>)) {
        deps.set(dep.id, dep);
      }
    }
  }

  if (table.default?.kind === "key") {
    deps.set(table.default.key.id, table.default.key);
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
export function decision<T, O, P extends Predicate<T>>(
  ops: RequiredOps<T, P>,
  target: Key<O>,
  table: DecisionTable<T, O, P>,
): Rule<O> {
  return rule({
    target,
    deps: decisionDependencies(table),
    eval: (get) => {
      for (const row of table.rows) {
        if (row.when.every((p) => evalPredicate(p, ops, get))) {
          const output = row.then;
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
