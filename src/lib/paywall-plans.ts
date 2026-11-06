import type { DsTypeRole } from "@/design/tokens.generated";
import type { BillingPeriod } from "./paywall-copy";

/**
 * The round-6 paywall's plan logic (BACKLOG 0.0-bk). Every price, currency, trial and saving here is worked out from
 * the offer /api/pro-offering returns for this learner (RevenueCat Web Billing); nothing is typed in. A plan with a
 * null price is one whose price is not for this learner's country: checkout shows it in their currency, so the
 * paywall shows no number at all.
 */
export type PaywallPlan = {
  period: BillingPeriod;
  /** Formatted for display, e.g. "$59.99", or null when the price is not for this learner's country. */
  price: string | null;
  /** The same price in micros; null exactly when `price` is null. */
  amountMicros: number | null;
  /** ISO 4217, e.g. "USD"; null exactly when `price` is null. */
  currency: string | null;
  /** The free trial this learner can still get, in days, or null. */
  trialDays: number | null;
  purchaseUrl: string;
};

const PLAN_NAME: Record<BillingPeriod, string> = { month: "Monthly", year: "Yearly" };

/**
 * Text roles (App Store 3.1.2, kept on the web): the price line and the trial line take these design-system type
 * roles and nothing else, and paywall-plans.test.ts pins that the price role is at least the trial role.
 */
export const PAYWALL_TEXT_ROLE = {
  price: "ds-type-headline",
  trial: "ds-type-footnote",
} as const;

/** The generated CSS class for a type role: displayXL → ds-type-display-x-l. */
export function typeRoleClass(role: DsTypeRole): string {
  return `ds-type-${role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/** Yearly first (the selected one), then monthly. */
export function orderPlans(plans: readonly PaywallPlan[]): PaywallPlan[] {
  const rank: Record<BillingPeriod, number> = { year: 0, month: 1 };
  return [...plans].sort((a, b) => rank[a.period] - rank[b.period]);
}

/** When the first payment is taken: the trial's length after now, or now without a trial. */
export function firstPaymentDate(now: Date, trialDays: number | null): Date {
  const d = new Date(now);
  if (trialDays && trialDays > 0) d.setDate(d.getDate() + trialDays);
  return d;
}

/** "13 November" (en-GB) or "November 13" (en-US); the year only when it is not this year. */
export function formatPaymentDay(date: Date, now: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  }).format(date);
}

/** The dashed "when do I pay" row. Without a trial it never mentions one. */
export function whenLine(
  trialDays: number | null,
  now: Date,
  locale?: string,
): { lead: string; rest: string } {
  if (trialDays && trialDays > 0) {
    const day = formatPaymentDay(firstPaymentDate(now, trialDays), now, locale);
    return {
      lead: "Nothing to pay today.",
      rest: `First payment on ${day}. Cancel before then and you pay nothing.`,
    };
  }
  return {
    lead: "First payment today, when you confirm.",
    rest: "Cancel any time and it stops the next renewal.",
  };
}

/** "$59.99 a year after the trial", "$9.99 a month", or the plan's name when the price is only known at checkout. */
export function planPriceLine(plan: PaywallPlan, hasTrial: boolean): string {
  if (plan.price === null)
    return `${PLAN_NAME[plan.period]} plan, priced in your currency at checkout`;
  return `${plan.price} a ${plan.period}${hasTrial ? " after the trial" : ""}`;
}

/** "Free for 7 days" from the offer's own trial, or null when this learner has none. */
export function planTrialLine(trialDays: number | null): string | null {
  if (!trialDays || trialDays < 1) return null;
  return `Free for ${trialDays} ${trialDays === 1 ? "day" : "days"}`;
}

function money(micros: number, currency: string): string {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(micros / 1_000_000);
}

/** The small line on a plan card: the yearly price per month, worked out in its own currency. */
export function perMonthLine(plan: PaywallPlan): string {
  if (plan.period === "year" && plan.amountMicros !== null && plan.currency)
    return `${money(plan.amountMicros / 12, plan.currency)} a month`;
  return `per ${plan.period}`;
}

/** The yearly plan's saving against twelve months, in whole percent, or null when it cannot be stated honestly. */
export function yearlySavingPercent(plans: readonly PaywallPlan[]): number | null {
  const year = plans.find((p) => p.period === "year");
  const month = plans.find((p) => p.period === "month");
  if (!year || !month || year.amountMicros === null || month.amountMicros === null) return null;
  if (!year.currency || year.currency !== month.currency || month.amountMicros <= 0) return null;
  const pct = Math.round((1 - year.amountMicros / (month.amountMicros * 12)) * 100);
  return pct >= 1 ? pct : null;
}
