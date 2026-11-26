/**
 * The trial-ending reminder (docs/OPEN-ITEMS.md item 94): pure rules and wording. The sweep that uses them is
 * src/lib/trial-reminder.server.ts. Nothing here talks to a network, so every rule is pinned by trial-reminder.test.ts.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** A trial is reminded about when it ends within this many days (and has not ended yet): "about 2 days before". */
export const REMINDER_WINDOW_DAYS = 3;
/** Only accounts seen this recently are looked up, so a scan costs a bounded number of RevenueCat reads. */
export const CANDIDATE_ACTIVE_DAYS = 9;
/** Each learner is read from RevenueCat at most this often (the sweep itself runs every 15 minutes). */
export const RECHECK_AFTER_MS = 20 * 60 * 60 * 1000;
/** One sweep stops reading after this long: the pg_net call to the route times out at 30 seconds. */
export const SWEEP_BUDGET_MS = 18_000;
/** A pause between RevenueCat reads, to stay well inside its rate limit. */
export const GAP_BETWEEN_READS_MS = 150;
/** Consecutive RevenueCat server errors (5xx) after which the sweep stops. */
export const MAX_CONSECUTIVE_5XX = 3;

/** The setting that turns the whole feature on: exactly `true` (surrounding spaces ignored). Anything else, including
 * `TRUE` or `1`, leaves it off. */
export function reminderEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TRIAL_REMINDER_ENABLED?.trim() === "true";
}

/** What RevenueCat says about one learner's trial (see getTrialSubscription). */
export type TrialSubscription = {
  /** RevenueCat's product identifier for the plan the trial turns into. */
  productId: string;
  /** When the trial ends, which is when the first charge happens. */
  trialEndsAt: Date;
  /** Where it was bought: "app_store", "play_store", "web" or RevenueCat's own word. */
  store: string | null;
  /** True once the learner turned renewal off, so the trial will simply end with no charge. */
  willNotRenew: boolean;
  /** True when the store reports a payment problem. */
  billingIssue: boolean;
  /** RevenueCat's management link, when it gave one (the web billing portal). */
  managementUrl: string | null;
};

/** Whether a trial needs the reminder now: ends soon, has not ended, and will really convert to a paid plan. */
export function needsReminder(trial: TrialSubscription, now: Date): boolean {
  const left = trial.trialEndsAt.getTime() - now.getTime();
  if (!(left > 0 && left <= REMINDER_WINDOW_DAYS * DAY_MS)) return false;
  // Already cancelled: it ends with no charge, so a "your trial is ending" email would only worry them.
  if (trial.willNotRenew) return false;
  // A payment problem is the store's own message to send, not ours.
  if (trial.billingIssue) return false;
  return true;
}

/** Where to manage the subscription: RevenueCat's link when it gave one, otherwise the store's own page. */
export function manageUrlFor(trial: Pick<TrialSubscription, "store" | "managementUrl">): string {
  if (trial.managementUrl) return trial.managementUrl;
  if (trial.store === "play_store") return "https://play.google.com/store/account/subscriptions";
  if (trial.store === "app_store") return "https://apps.apple.com/account/subscriptions";
  return "https://learnwithalphonso.com/support";
}

/** What RevenueCat reports about the plan; every field can be missing, and then that part is left out. */
export type PlanDetails = {
  period: "month" | "year" | null;
  /** The price already formatted for display, as RevenueCat reports it. */
  price: string | null;
  /** The country RevenueCat's indicative price is for (e.g. "US"); null when it did not say. */
  priceCountry?: string | null;
};

/**
 * The price may be shown only when it is certainly the learner's: the trial was bought on the web (an app-store price
 * is set by the store, per country, and RevenueCat's figure is for one country only) AND the offering's price country
 * is the learner's own. Otherwise the number is left out and the email points to the subscription page.
 */
export function priceToShow(
  trial: Pick<TrialSubscription, "store">,
  plan: PlanDetails,
  learnerCountry: string | null,
): PlanDetails {
  const same =
    !!plan.price &&
    !!plan.priceCountry &&
    !!learnerCountry &&
    plan.priceCountry.toUpperCase() === learnerCountry.toUpperCase();
  return trial.store === "web" && same ? plan : { ...plan, price: null };
}

export type ReminderEmail = { subject: string; text: string };

const longDate = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(d);

/**
 * Plain, friendly and honest: when the trial ends, what happens then, what it costs (only when RevenueCat reported a
 * price; nothing is invented), and one link to stop it. No marketing, no pressure.
 */
export function buildTrialReminderEmail(
  trial: TrialSubscription,
  plan: PlanDetails,
  manageUrl: string,
): ReminderEmail {
  const when = longDate(trial.trialEndsAt);
  const planName =
    plan.period === "month"
      ? "the monthly plan"
      : plan.period === "year"
        ? "the yearly plan"
        : "the paid plan";
  const unit =
    plan.period === "year" ? "year" : plan.period === "month" ? "month" : "billing period";
  const cost = plan.price ? `${plan.price} per ${unit}` : "your plan's regular price";
  const exact = plan.price
    ? "The exact amount, with any tax, is on your subscription page."
    : "The exact amount is on your subscription page.";
  const text = [
    "Hi,",
    "",
    `This is a quick heads-up: your free trial of Alphonso Pro ends on ${when} (UTC).`,
    "",
    `If you do nothing, your subscription carries on as ${planName} at ${cost}, and you will be charged when the trial ends.`,
    exact,
    "If you would rather not continue, you can cancel any time before then and you will not be charged.",
    "",
    `Manage or cancel your subscription: ${manageUrl}`,
    "",
    "We send this one reminder per trial and nothing else about it. If you are happy to carry on, there is nothing to do.",
    "",
    "The Alphonso team",
  ].join("\n");
  return { subject: `Your Alphonso Pro free trial ends on ${when}`, text };
}
