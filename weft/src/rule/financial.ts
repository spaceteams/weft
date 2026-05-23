import type { AnyKey, Key } from "../key";
import type {
  Additive,
  Divisible,
  Exponential,
  OpsDescriptor,
  Scalable,
} from "../semantics/algebra";
import { type Rule, rule } from ".";
import { type Operand, resolveOperand } from "./operand";

/**
 * The combined algebra traits required by financial rule factories.
 * Any type implementing these can be used with futureValue, presentValue, and annuityPayment.
 */
export type FinancialOps<T> = OpsDescriptor &
  Additive<T> &
  Scalable<T, T> &
  Divisible<T, T> &
  Exponential<T>;

export type FutureValueSpec = {
  op: "future-value";
  opsDescriptor: OpsDescriptor;
  rate: Operand<unknown>;
  nper: Operand<unknown>;
  pmt: Operand<unknown>;
  pv: Operand<unknown>;
};

/**
 * FV = PV × (1+r)^n + PMT × ((1+r)^n − 1) / r
 * When r = 0: FV = PV + PMT × n
 */
export function futureValue<T>(
  ops: FinancialOps<T>,
  target: Key<T>,
  rate: Operand<T>,
  nper: Operand<T>,
  pmt: Operand<T>,
  pv: Operand<T>,
): Rule<T> {
  const spec: FutureValueSpec = {
    op: "future-value",
    opsDescriptor: { family: ops.family, version: ops.version },
    rate: rate as Operand<unknown>,
    nper: nper as Operand<unknown>,
    pmt: pmt as Operand<unknown>,
    pv: pv as Operand<unknown>,
  };
  const deps: AnyKey[] = [];
  if (rate.__kind === "key") deps.push(rate);
  if (nper.__kind === "key") deps.push(nper);
  if (pmt.__kind === "key") deps.push(pmt);
  if (pv.__kind === "key") deps.push(pv);
  return rule({
    target,
    spec,
    deps,
    eval: (get) => {
      const r = resolveOperand(rate, get);
      const n = resolveOperand(nper, get);
      const payment = resolveOperand(pmt, get);
      const present = resolveOperand(pv, get);
      let output: T;
      if (ops.eq(r, ops.zero())) {
        // FV = PV + PMT × n
        output = ops.add(present, ops.scale(payment, n));
      } else {
        // compound = (1 + r) ^ n
        const compound = ops.pow(ops.add(ops.one(), r), n);
        // FV = PV × compound + PMT × ((compound − 1) / r)
        output = ops.add(
          ops.scale(present, compound),
          ops.scale(payment, ops.div(ops.sub(compound, ops.one()), r)),
        );
      }
      return { output };
    },
  });
}

export type PresentValueSpec = {
  op: "present-value";
  opsDescriptor: OpsDescriptor;
  rate: Operand<unknown>;
  nper: Operand<unknown>;
  pmt: Operand<unknown>;
  fv: Operand<unknown>;
};

/**
 * PV = FV / (1+r)^n − PMT × ((1+r)^n − 1) / (r × (1+r)^n)
 * When r = 0: PV = FV − PMT × n
 */
export function presentValue<T>(
  ops: FinancialOps<T>,
  target: Key<T>,
  rate: Operand<T>,
  nper: Operand<T>,
  pmt: Operand<T>,
  fv: Operand<T>,
): Rule<T> {
  const spec: PresentValueSpec = {
    op: "present-value",
    opsDescriptor: { family: ops.family, version: ops.version },
    rate: rate as Operand<unknown>,
    nper: nper as Operand<unknown>,
    pmt: pmt as Operand<unknown>,
    fv: fv as Operand<unknown>,
  };
  const deps: AnyKey[] = [];
  if (rate.__kind === "key") deps.push(rate);
  if (nper.__kind === "key") deps.push(nper);
  if (pmt.__kind === "key") deps.push(pmt);
  if (fv.__kind === "key") deps.push(fv);
  return rule({
    target,
    spec,
    deps,
    eval: (get) => {
      const r = resolveOperand(rate, get);
      const n = resolveOperand(nper, get);
      const payment = resolveOperand(pmt, get);
      const future = resolveOperand(fv, get);
      let output: T;
      if (ops.eq(r, ops.zero())) {
        // PV = FV − PMT × n
        output = ops.sub(future, ops.scale(payment, n));
      } else {
        // compound = (1 + r) ^ n
        const compound = ops.pow(ops.add(ops.one(), r), n);
        // PV = FV / compound − PMT × ((compound − 1) / (r × compound))
        output = ops.sub(
          ops.div(future, compound),
          ops.scale(payment, ops.div(ops.sub(compound, ops.one()), ops.scale(r, compound))),
        );
      }
      return { output };
    },
  });
}

export type AnnuityPaymentSpec = {
  op: "annuity-payment";
  opsDescriptor: OpsDescriptor;
  rate: Operand<unknown>;
  nper: Operand<unknown>;
  pv: Operand<unknown>;
};

/**
 * PMT = PV × r × (1+r)^n / ((1+r)^n − 1)
 * When r = 0: PMT = PV / n
 */
export function annuityPayment<T>(
  ops: FinancialOps<T>,
  target: Key<T>,
  rate: Operand<T>,
  nper: Operand<T>,
  pv: Operand<T>,
): Rule<T> {
  const spec: AnnuityPaymentSpec = {
    op: "annuity-payment",
    opsDescriptor: { family: ops.family, version: ops.version },
    rate: rate as Operand<unknown>,
    nper: nper as Operand<unknown>,
    pv: pv as Operand<unknown>,
  };
  const deps: AnyKey[] = [];
  if (rate.__kind === "key") deps.push(rate);
  if (nper.__kind === "key") deps.push(nper);
  if (pv.__kind === "key") deps.push(pv);
  return rule({
    target,
    spec,
    deps,
    eval: (get) => {
      const r = resolveOperand(rate, get);
      const n = resolveOperand(nper, get);
      const present = resolveOperand(pv, get);
      let output: T;
      if (ops.eq(r, ops.zero())) {
        // PMT = PV / n
        output = ops.div(present, n);
      } else {
        // compound = (1 + r) ^ n
        const compound = ops.pow(ops.add(ops.one(), r), n);
        // PMT = PV × r × compound / (compound − 1)
        output = ops.div(ops.scale(ops.scale(present, r), compound), ops.sub(compound, ops.one()));
      }
      return { output };
    },
  });
}
