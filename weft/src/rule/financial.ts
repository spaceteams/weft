import type { Key, KeyId } from "../key";
import type {
  Additive,
  Divisible,
  Exponential,
  OpsDescriptor,
  Scalable,
} from "../semantics/algebra";
import { type Rule, rule } from ".";

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
  rate: KeyId;
  nper: KeyId;
  pmt: KeyId;
  pv: KeyId;
};

/**
 * FV = PV × (1+r)^n + PMT × ((1+r)^n − 1) / r
 * When r = 0: FV = PV + PMT × n
 */
export function futureValue<T>(
  ops: FinancialOps<T>,
  target: Key<T>,
  rate: Key<T>,
  nper: Key<T>,
  pmt: Key<T>,
  pv: Key<T>,
): Rule<T> {
  const spec: FutureValueSpec = {
    op: "future-value",
    opsDescriptor: { family: ops.family, version: ops.version },
    rate: rate.id,
    nper: nper.id,
    pmt: pmt.id,
    pv: pv.id,
  };
  return rule({
    target,
    spec,
    deps: [rate, nper, pmt, pv],
    eval: (get) => {
      const r = get(rate);
      const n = get(nper);
      const payment = get(pmt);
      const present = get(pv);
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
  rate: KeyId;
  nper: KeyId;
  pmt: KeyId;
  fv: KeyId;
};

/**
 * PV = FV / (1+r)^n − PMT × ((1+r)^n − 1) / (r × (1+r)^n)
 * When r = 0: PV = FV − PMT × n
 */
export function presentValue<T>(
  ops: FinancialOps<T>,
  target: Key<T>,
  rate: Key<T>,
  nper: Key<T>,
  pmt: Key<T>,
  fv: Key<T>,
): Rule<T> {
  const spec: PresentValueSpec = {
    op: "present-value",
    opsDescriptor: { family: ops.family, version: ops.version },
    rate: rate.id,
    nper: nper.id,
    pmt: pmt.id,
    fv: fv.id,
  };
  return rule({
    target,
    spec,
    deps: [rate, nper, pmt, fv],
    eval: (get) => {
      const r = get(rate);
      const n = get(nper);
      const payment = get(pmt);
      const future = get(fv);
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
  rate: KeyId;
  nper: KeyId;
  pv: KeyId;
};

/**
 * PMT = PV × r × (1+r)^n / ((1+r)^n − 1)
 * When r = 0: PMT = PV / n
 */
export function annuityPayment<T>(
  ops: FinancialOps<T>,
  target: Key<T>,
  rate: Key<T>,
  nper: Key<T>,
  pv: Key<T>,
): Rule<T> {
  const spec: AnnuityPaymentSpec = {
    op: "annuity-payment",
    opsDescriptor: { family: ops.family, version: ops.version },
    rate: rate.id,
    nper: nper.id,
    pv: pv.id,
  };
  return rule({
    target,
    spec,
    deps: [rate, nper, pv],
    eval: (get) => {
      const r = get(rate);
      const n = get(nper);
      const present = get(pv);
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
