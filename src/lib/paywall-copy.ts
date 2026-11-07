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
  practiceCardTitle: "Practice speaking with Hector",
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

/** Where a paywall was opened from. All but practice_end_prompt are the iPhone's raw values. */
export const PAYWALL_SOURCES = [
  "hector_tab",
  "hector_not_entitled",
  "practice_hector_card",
  "practice_end_prompt",
  "lesson_complete",
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

/**
 * The round-6 paywall (BACKLOG 0.0-bk, the approved "Mix" mock). Web first; iOS and Android take the same words
 * after sign-off. No price, currency, trial length, saving or daily number lives here: the daily allowance is
 * "a long conversation every day" (the server's cap stays), and everything priced comes from the offer.
 */
export const PRO_PAYWALL_COPY = {
  kicker: "Alphonso Pro",
  headlineLead: "A tutor who ",
  headlineMark: "remembers you",
  headlineEnd: ".",
  exampleLabel: "Example call",
  factsLabel: "What Pro gives you",
  facts: [
    { title: "Any topic", detail: "no script" },
    { title: "Remembers", detail: "your weak spots" },
    { title: "Every day", detail: "a long conversation" },
  ],
  freeLabel: "Free for everyone",
  freeItems: ["Lessons", "Alphonso calls", "Audio", "Review"],
  freeNote: "Everything else stays free, always.",
  plansLabel: "Choose a plan",
  renewal: "Renews automatically until cancelled. Cancel any time in Manage Subscription.",
  restore: "Restore purchases",
  restoreNone: "No Alphonso Pro found on this account.",
  terms: "Terms",
  privacy: "Privacy",
  comingSoonTitle: "Coming soon",
  comingSoonBody:
    "Alphonso Pro isn't on sale on the web yet. Hector will be here soon, and everything else stays free in the meantime.",
  close: "Close",
  roomAlt: "Hector in his library",
} as const;

/** "Save 50%": the number is worked out from the two plans' prices (yearlySavingPercent), never typed in. */
export function savingBadge(percent: number): string {
  return `Save ${percent}%`;
}

export const PRO_WELCOME_COPY = {
  eyebrow: "Welcome to Pro",
  greeting: (name: string | null) => (name ? `Welcome, ${name}.` : "Welcome to Alphonso Pro."),
  ready: "Hector's ready.",
  body: "Start anywhere. He'll remember it next time.",
  openersTitle: "Try one of these",
  call: "Call Hector",
} as const;

type ExampleCall = {
  recalled: string;
  before: string;
  after: string;
  reply: string;
  praise: string;
};

/**
 * The labelled example call on the top of the paywall: Hector remembering last week's mistake, in the learner's
 * course. Spanish is the approved mock's exact call.
 */
export const EXAMPLE_CALLS: Record<"en" | "fr" | "es", ExampleCall> = {
  es: {
    before: "Last week you said ",
    recalled: "“soy cansado”",
    after: ". How are you feeling today?",
    reply: "Estoy cansado, pero feliz.",
    praise: "¡Perfecto! Estar for feelings. Nailed it.",
  },
  fr: {
    before: "Last week you said ",
    recalled: "“je suis faim”",
    after: ". Are you hungry today?",
    reply: "Oui, j'ai faim !",
    praise: "Parfait ! Avoir for hunger. Nailed it.",
  },
  en: {
    before: "Last week you said ",
    recalled: "“I am agree”",
    after: ". What do you think of the plan?",
    reply: "I agree, it's a great plan.",
    praise: "Perfect! Just “I agree”. Nailed it.",
  },
};

/** Three easy first lines for the welcome screen, in the learner's course. */
export const WELCOME_OPENERS: Record<"en" | "fr" | "es", readonly string[]> = {
  es: [
    "“Tell me about your weekend”",
    "“Help me practice ser and estar”",
    "“Let's chat about a film I like”",
  ],
  fr: [
    "“Tell me about your weekend”",
    "“Help me practice tu and vous”",
    "“Let's chat about a film I like”",
  ],
  en: [
    "“Tell me about your weekend”",
    "“Help me practice the present perfect”",
    "“Let's chat about a film I like”",
  ],
};

/** The example call for a course, by a typed switch rather than a computed key. */
export function exampleCallFor(course: "en" | "fr" | "es"): ExampleCall {
  switch (course) {
    case "es":
      return EXAMPLE_CALLS.es;
    case "fr":
      return EXAMPLE_CALLS.fr;
    default:
      return EXAMPLE_CALLS.en;
  }
}

/** The welcome openers for a course, by a typed switch rather than a computed key. */
export function welcomeOpenersFor(course: "en" | "fr" | "es"): readonly string[] {
  switch (course) {
    case "es":
      return WELCOME_OPENERS.es;
    case "fr":
      return WELCOME_OPENERS.fr;
    default:
      return WELCOME_OPENERS.en;
  }
}

/** The first name to pin on the Pro card, or null for a generated Learner-XXXX handle or no name. */
export function cardFirstName(displayName: string | null | undefined): string | null {
  const name = displayName?.trim() ?? "";
  if (!name || /^Learner-[0-9A-F]{4}$/i.test(name)) return null;
  return name.split(/\s+/)[0] ?? null;
}
