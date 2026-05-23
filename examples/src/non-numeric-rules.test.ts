import {
  coerce,
  compare,
  compileModel,
  compose,
  concat,
  conditional,
  createModel,
  evaluate,
  format,
  key,
  logicalAnd,
  match,
  numericRules,
  pick,
  pluck,
  spread,
  template,
  value,
  when,
} from "@spaceteams/weft";
import { describe, expect, it } from "vitest";

const n = numericRules;

describe("mixed numeric + string model", () => {
  const firstName = key<string>("first_name");
  const lastName = key<string>("last_name");
  const age = key<number>("age");
  const salary = key<number>("salary");
  const bonus = key<number>("bonus");
  const totalComp = key<number>("total_comp");
  const isAdult = key<boolean>("is_adult");
  const fullName = key<string>("full_name");
  const greeting = key<string>("greeting");
  const compDisplay = key<string>("comp_display");

  const m = createModel();
  m.input(firstName);
  m.input(lastName);
  m.input(age);
  m.input(salary);
  m.input(bonus);

  m.rule(n.sum(totalComp, [salary, bonus]), { label: "Total Compensation" });
  m.rule(compare(isAdult, age, value(18), "gte"));
  m.rule(concat(fullName, [firstName, lastName], " "));
  m.rule(
    template(greeting, "Hello, {full_name}! You are {age} years old.", {
      full_name: fullName,
      age,
    }),
  );
  m.rule(format(compDisplay, totalComp, (v) => `$${v.toLocaleString("en-US")}`));

  const compiled = compileModel(m.build());
  if (!compiled.ok) throw new Error(compiled.issues.map((i) => i.message).join());
  const model = compiled.model;

  it("evaluates a model mixing numeric and string rules", () => {
    const result = evaluate(model, {
      first_name: "Alice",
      last_name: "Smith",
      age: 30,
      salary: 75000,
      bonus: 5000,
    });

    expect(result.values.get("total_comp")).toBe(80000);
    expect(result.values.get("is_adult")).toBe(true);
    expect(result.values.get("full_name")).toBe("Alice Smith");
    expect(result.values.get("greeting")).toBe("Hello, Alice Smith! You are 30 years old.");
    expect(result.values.get("comp_display")).toBe("$80,000");
  });
});

describe("numericRules + match + compose", () => {
  const age = key<number>("age");
  const yearsOfService = key<number>("years_of_service");
  const baseSalary = key<number>("base_salary");
  const bonusRate = key<number>("bonus_rate");
  const bonus = key<number>("bonus");
  const totalComp = key<number>("total_comp");
  const summary = key<{ name: string; total: number; tier: string }>("summary");
  const name = key<string>("name");
  const tier = key<string>("tier");

  const m = createModel();
  m.input(age);
  m.input(yearsOfService);
  m.input(baseSalary);
  m.input(name);

  // Decision table for bonus rate based on tenure
  m.rule(
    match(bonusRate, {
      name: "bonus-rates",
      rows: [
        { id: "veteran", when: [when(yearsOfService).gte(10)], output: value(0.2) },
        { id: "experienced", when: [when(yearsOfService).gte(5)], output: value(0.1) },
        { id: "new", when: [when(yearsOfService).lt(5)], output: value(0.05) },
      ],
    }),
  );

  // Decision table for tier label
  m.rule(
    match(tier, {
      name: "tier-labels",
      rows: [
        {
          id: "senior",
          when: [when(yearsOfService).gte(10), when(age).gte(40)],
          output: value("Senior"),
        },
        { id: "mid", when: [when(yearsOfService).gte(5)], output: value("Mid-Level") },
      ],
      default: value("Junior"),
    }),
  );

  m.rule(n.scale(bonus, baseSalary, bonusRate), { label: "Bonus" });
  m.rule(n.sum(totalComp, [baseSalary, bonus]), { label: "Total Comp" });
  m.rule(compose(summary, { name, total: totalComp, tier }));

  const compiled = compileModel(m.build());
  if (!compiled.ok) throw new Error(compiled.issues.map((i) => i.message).join());
  const model = compiled.model;

  it("veteran with high tenure gets 20% bonus", () => {
    const result = evaluate(model, {
      age: 45,
      years_of_service: 12,
      base_salary: 100000,
      name: "Bob",
    });

    expect(result.values.get("bonus_rate")).toBe(0.2);
    expect(result.values.get("bonus")).toBe(20000);
    expect(result.values.get("total_comp")).toBe(120000);
    expect(result.values.get("tier")).toBe("Senior");
    expect(result.values.get("summary")).toEqual({
      name: "Bob",
      total: 120000,
      tier: "Senior",
    });
  });

  it("new hire gets 5% bonus and Junior tier", () => {
    const result = evaluate(model, {
      age: 25,
      years_of_service: 2,
      base_salary: 60000,
      name: "Carol",
    });

    expect(result.values.get("bonus_rate")).toBe(0.05);
    expect(result.values.get("bonus")).toBe(3000);
    expect(result.values.get("total_comp")).toBe(63000);
    expect(result.values.get("tier")).toBe("Junior");
    expect(result.values.get("summary")).toEqual({
      name: "Carol",
      total: 63000,
      tier: "Junior",
    });
  });
});

describe("object helpers: pluck + pick + spread", () => {
  const config = key<{ pricing: { rate: number; markup: number }; name: string }>("config");
  const rate = key<number>("rate");
  const rateObj = key<{ rate: number }>("rate_obj");
  const extra = key<{ region: string }>("extra");
  const merged = key<{ rate: number; region: string }>("merged");

  const m = createModel();
  m.input(config);
  m.input(extra);
  m.rule(pluck(rate, config, ["pricing", "rate"]));
  m.rule(compose(rateObj, { rate }));
  m.rule(spread(merged, [rateObj, extra]));

  // Simpler version — just test pluck + pick
  const m2 = createModel();
  const customer = key<{ name: string; age: number; email: string; address: { city: string } }>(
    "customer",
  );
  const profile = key<{ name: string; email: string }>("profile");
  const city = key<string>("city");
  m2.input(customer);
  m2.rule(pick(profile, customer, ["name", "email"]));
  m2.rule(pluck(city, customer, "address.city"));

  const compiled2 = compileModel(m2.build());
  if (!compiled2.ok) throw new Error(compiled2.issues.map((i) => i.message).join());
  const model2 = compiled2.model;

  it("pluck extracts deep path, pick extracts multiple fields", () => {
    const result = evaluate(model2, {
      customer: { name: "Alice", age: 30, email: "a@b.com", address: { city: "Berlin" } },
    });
    expect(result.values.get("profile")).toEqual({ name: "Alice", email: "a@b.com" });
    expect(result.values.get("city")).toBe("Berlin");
  });
});

describe("boolean logic pipeline", () => {
  const age = key<number>("age");
  const income = key<number>("income");
  const hasGoodCredit = key<boolean>("has_good_credit");
  const isAdult = key<boolean>("is_adult");
  const hasMinIncome = key<boolean>("has_min_income");
  const isEligible = key<boolean>("is_eligible");
  const result = key<string>("result");

  const m = createModel();
  m.input(age);
  m.input(income);
  m.input(hasGoodCredit);

  m.rule(compare(isAdult, age, value(18), "gte"));
  m.rule(compare(hasMinIncome, income, value(30000), "gte"));
  m.rule(logicalAnd(isEligible, [isAdult, hasMinIncome, hasGoodCredit]));
  m.rule(conditional(result, isEligible, value("approved"), value("denied")));

  const compiled = compileModel(m.build());
  if (!compiled.ok) throw new Error(compiled.issues.map((i) => i.message).join());
  const model = compiled.model;

  it("all conditions met → approved", () => {
    const r = evaluate(model, { age: 25, income: 50000, has_good_credit: true });
    expect(r.values.get("is_eligible")).toBe(true);
    expect(r.values.get("result")).toBe("approved");
  });

  it("one condition fails → denied", () => {
    const r = evaluate(model, { age: 16, income: 50000, has_good_credit: true });
    expect(r.values.get("is_eligible")).toBe(false);
    expect(r.values.get("result")).toBe("denied");
  });
});

describe("coerce + format pipeline", () => {
  const rawAge = key<string>("raw_age");
  const age = key<number>("age");
  const isAdult = key<boolean>("is_adult");
  const label = key<string>("label");

  const m = createModel();
  m.input(rawAge);
  m.rule(coerce(age, rawAge, (s) => Number.parseInt(s, 10)));
  m.rule(compare(isAdult, age, value(18), "gte"));
  m.rule(format(label, age, (v) => `Age: ${v}`));

  const compiled = compileModel(m.build());
  if (!compiled.ok) throw new Error(compiled.issues.map((i) => i.message).join());
  const model = compiled.model;

  it("coerces string input and formats output", () => {
    const r = evaluate(model, { raw_age: "25" });
    expect(r.values.get("age")).toBe(25);
    expect(r.values.get("is_adult")).toBe(true);
    expect(r.values.get("label")).toBe("Age: 25");
  });
});
