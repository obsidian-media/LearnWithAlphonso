import { describe, expect, it } from "vitest";
import { DS_TOKENS, type DsTypeRole } from "@/design/tokens.generated";
import {
  PAYWALL_TEXT_ROLE,
  firstPaymentDate,
  formatPaymentDay,
  orderPlans,
  perMonthLine,
  planPriceLine,
  planTrialLine,
  typeRoleClass,
  whenLine,
  yearlySavingPercent,
  type PaywallPlan,
} from "./paywall-plans";

// Offers here are made up for the tests; the paywall never holds a price of its own.
const yearly: PaywallPlan = {
  period: "year",
  price: "$59.99",
  amountMicros: 59_990_000,
  currency: "USD",
  trialDays: 7,
  purchaseUrl: "https://pay.example/y",
};
const monthly: PaywallPlan = {
  period: "month",
  price: "$9.99",
  amountMicros: 9_990_000,
  currency: "USD",
  trialDays: 7,
  purchaseUrl: "https://pay.example/m",
};

describe("first payment date", () => {
  it("is the trial's length after today, from the offer's own trial", () => {
    const now = new Date(2026, 10, 6, 15, 30);
    expect(firstPaymentDate(now, 7)).toEqual(new Date(2026, 10, 13, 15, 30));
    expect(firstPaymentDate(now, 3)).toEqual(new Date(2026, 10, 9, 15, 30));
    expect(firstPaymentDate(now, 14)).toEqual(new Date(2026, 10, 20, 15, 30));
  });

  it("crosses a month and a year end", () => {
    expect(firstPaymentDate(new Date(2026, 11, 28), 7)).toEqual(new Date(2027, 0, 4));
    // The 31st, a short February and a leap day: no day lost or gained at a month end.
    expect(firstPaymentDate(new Date(2027, 0, 31), 7)).toEqual(new Date(2027, 1, 7));
    expect(firstPaymentDate(new Date(2027, 1, 25), 7)).toEqual(new Date(2027, 2, 4));
    expect(firstPaymentDate(new Date(2028, 1, 27), 3)).toEqual(new Date(2028, 2, 1));
  });

  it("is today without a trial", () => {
    const now = new Date(2026, 10, 6);
    expect(firstPaymentDate(now, null)).toEqual(now);
    expect(firstPaymentDate(now, 0)).toEqual(now);
  });

  it("says the day and month, and the year only when it is not this year", () => {
    const now = new Date(2026, 10, 6);
    expect(formatPaymentDay(new Date(2026, 10, 13), now, "en-GB")).toBe("13 November");
    expect(formatPaymentDay(new Date(2027, 0, 4), now, "en-GB")).toBe("4 January 2027");
    expect(formatPaymentDay(new Date(2026, 10, 13), now, "en-US")).toBe("November 13");
  });
});

describe("the when line", () => {
  const now = new Date(2026, 10, 6);
  it("with a trial: nothing today, the exact date, and cancelling before it costs nothing", () => {
    expect(whenLine(7, now, "en-GB")).toEqual({
      lead: "Nothing to pay today.",
      rest: "First payment on 13 November. Cancel before then and you pay nothing.",
    });
  });

  it("without a trial: paid today, and never a word about a trial", () => {
    const line = whenLine(null, now, "en-GB");
    expect(line.lead).toBe("First payment today, when you confirm.");
    expect(`${line.lead} ${line.rest}`).not.toMatch(/trial|free/i);
  });
});

describe("plan lines", () => {
  it("price line follows the plan and the trial", () => {
    expect(planPriceLine(yearly, true)).toBe("$59.99 a year after the trial");
    expect(planPriceLine(monthly, true)).toBe("$9.99 a month after the trial");
    expect(planPriceLine(yearly, false)).toBe("$59.99 a year");
  });

  it("with no price for this country: no number, and still no trial word when there is none", () => {
    const priceless = { ...yearly, price: null, amountMicros: null, currency: null };
    expect(planPriceLine(priceless, true)).toBe("Yearly plan, priced in your currency at checkout");
    expect(planPriceLine(priceless, false)).not.toMatch(/\d|trial/);
  });

  it("trial line comes from the offer's days, and is null without one", () => {
    expect(planTrialLine(7)).toBe("Free for 7 days");
    expect(planTrialLine(3)).toBe("Free for 3 days");
    expect(planTrialLine(1)).toBe("Free for 1 day");
    expect(planTrialLine(null)).toBeNull();
    expect(planTrialLine(0)).toBeNull();
  });

  it("per-month line for the yearly plan is worked out from its own amount and currency", () => {
    expect(perMonthLine(yearly)).toBe("$5.00 a month");
    expect(perMonthLine({ ...yearly, amountMicros: 47_880_000, currency: "EUR" })).toBe(
      "€3.99 a month",
    );
    expect(perMonthLine(monthly)).toBe("per month");
    expect(perMonthLine({ ...yearly, price: null, amountMicros: null, currency: null })).toBe(
      "per year",
    );
  });
});

describe("yearly saving", () => {
  it("is computed from the two prices, never typed in", () => {
    expect(yearlySavingPercent([yearly, monthly])).toBe(50);
    expect(yearlySavingPercent([{ ...yearly, amountMicros: 79_990_000 }, monthly])).toBe(33);
  });

  it("is null when it cannot be honest: one plan, a missing price, two currencies, or no saving", () => {
    expect(yearlySavingPercent([monthly])).toBeNull();
    expect(yearlySavingPercent([{ ...yearly, amountMicros: null }, monthly])).toBeNull();
    expect(yearlySavingPercent([{ ...yearly, currency: "EUR" }, monthly])).toBeNull();
    expect(yearlySavingPercent([{ ...yearly, amountMicros: 119_880_000 }, monthly])).toBeNull();
  });
});

describe("plan order", () => {
  it("yearly first (it is the one selected), monthly next", () => {
    expect(orderPlans([monthly, yearly]).map((p) => p.period)).toEqual(["year", "month"]);
  });
});

describe("App Store 3.1.2 on the web: the price is at least as prominent as the trial", () => {
  const roleOf = (cls: string): DsTypeRole => {
    const key = (Object.keys(DS_TOKENS.type) as DsTypeRole[]).find((k) => typeRoleClass(k) === cls);
    if (!key) throw new Error(`${cls} is not a type token`);
    return key;
  };
  const price = DS_TOKENS.type[roleOf(PAYWALL_TEXT_ROLE.price)];
  const trial = DS_TOKENS.type[roleOf(PAYWALL_TEXT_ROLE.trial)];

  it("price type is at least the trial type in size and weight", () => {
    expect(price.size).toBeGreaterThanOrEqual(trial.size);
    expect(price.weight).toBeGreaterThanOrEqual(trial.weight);
  });

  it("type role classes are the generated ds-type classes", () => {
    expect(typeRoleClass("displayXL")).toBe("ds-type-display-x-l");
    expect(typeRoleClass("headline")).toBe("ds-type-headline");
  });
});
