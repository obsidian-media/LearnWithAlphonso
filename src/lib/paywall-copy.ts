/**
 * Web paywall wording. Strings that mean the same as the iPhone paywall are the iPhone's exact strings
 * (PaywallCopy in ios/LearnWithAlphonsoKit/.../PaywallPresentation.swift); paywall-copy-parity.test.ts keeps them
 * equal. The price and trial come from RevenueCat (/api/pro-offering), never from this file.
 */
export const PAYWALL_COPY = {
  fallbackTitle: "Alphonso Pro",
  mascotMessage: "Meet Hector, your AI tutor",
  featureBlurb:
    "Hector, your personal AI tutor for voice conversation practice, with memory of your level and weak spots between sessions.",
  loadFailed: "Couldn't load subscription options. Check your connection and try again.",
  tryAgain: "Try again",
  startFreeTrial: "Start free trial",
  subscribe: "Subscribe",
  manage: "Manage Subscription",
  practiceCardTitle: "Practise speaking with Hector",
  practiceCardSubtitle:
    "A voice tutor that remembers your level and weak spots. Part of Alphonso Pro.",
} as const;

/** Web-only wording (there is no iPhone equivalent). */
export const WEB_PAYWALL_COPY = {
  manageOnIphone: "Manage it in your iPhone's Settings.",
  checkFailed: "Couldn't check your subscription. Try again.",
  activating: "Payment received, activating…",
  continueWithHector: "Continue with Hector",
  continueWithHectorSubtitle: "Keep talking with your AI tutor. Part of Alphonso Pro.",
} as const;

/** Where a paywall was opened from. The first three are the iPhone's raw values. */
export const PAYWALL_SOURCES = [
  "hector_tab",
  "hector_not_entitled",
  "practice_hector_card",
  "practice_end_prompt",
] as const;
export type PaywallSource = (typeof PAYWALL_SOURCES)[number];

export function isPaywallSource(value: unknown): value is PaywallSource {
  return typeof value === "string" && (PAYWALL_SOURCES as readonly string[]).includes(value);
}

export type BillingPeriod = "month" | "year";

const PLAN_NAME: Record<BillingPeriod, string> = { month: "Monthly", year: "Yearly" };

/** What the renewal costs, in words, when the number is only known at checkout. */
function checkoutPrice(period: BillingPeriod): string {
  return `the ${PLAN_NAME[period].toLowerCase()} price shown at checkout`;
}

/**
 * "$9.99 / month", as on iPhone. A null price (no price for this learner's country) is web-only wording: the
 * hosted checkout shows the amount in their currency.
 */
export function paywallPriceLine(price: string | null, period: BillingPeriod): string {
  if (price === null) return `${PLAN_NAME[period]} plan, priced in your currency at checkout`;
  return `${price} / ${period}`;
}

/** "Free for 7 days, then $9.99/month", or null without a trial. */
export function paywallTrialLine(
  price: string | null,
  period: BillingPeriod,
  trialDays: number | null,
): string | null {
  if (!trialDays || trialDays < 1) return null;
  const then = price === null ? checkoutPrice(period) : `${price}/${period}`;
  return `Free for ${trialDays} ${trialDays === 1 ? "day" : "days"}, then ${then}`;
}

/** The auto-renewal disclosure under the button (the web counterpart of the iPhone's App Store wording). */
export function paywallDisclosure(
  price: string | null,
  period: BillingPeriod,
  trialDays: number | null,
): string {
  const recurring = price === null ? checkoutPrice(period) : `${price}/${period}`;
  const cancel = "Cancel any time from Manage Subscription; cancelling stops the next renewal.";
  return trialDays && trialDays >= 1
    ? `After the free trial, Alphonso Pro renews automatically at ${recurring} until you cancel. Your card is charged when the trial ends. ${cancel}`
    : `Alphonso Pro renews automatically at ${recurring} until you cancel. Your card is charged when you confirm the purchase. ${cancel}`;
}
