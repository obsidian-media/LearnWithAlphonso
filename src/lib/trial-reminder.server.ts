import type { EmailMessage } from "./report-notify.server";
import type { TrialRead } from "./revenuecat-entitlement";
import {
  CANDIDATE_ACTIVE_DAYS,
  GAP_BETWEEN_READS_MS,
  MAX_CONSECUTIVE_5XX,
  RECHECK_AFTER_MS,
  SWEEP_BUDGET_MS,
  buildTrialReminderEmail,
  manageUrlFor,
  needsReminder,
  priceToShow,
  reminderEnabled,
  type PlanDetails,
} from "./trial-reminder";

/**
 * The trial-ending reminder (docs/OPEN-ITEMS.md item 94), run from the 15-minute maintenance sweep
 * (src/lib/maintenance.server.ts). RevenueCat has no "who is in a trial" query and sends no webhook here, so each sweep
 * reads RevenueCat for the recently active learners who have not been checked in the last 20 hours (least recently
 * checked first, never-checked first of all), and emails the ones whose trial ends within 3 days.
 *
 * Bounded: a sweep stops reading after SWEEP_BUDGET_MS (the pg_net call to the route times out at 30 s), pauses between
 * reads, and stops at once on a 429 or after 3 server errors in a row. Each learner read is recorded
 * (trial_reminder_checked) right away, so a cut-off sweep is simply continued by the next one and nobody is starved:
 * every active learner is read about once every 20 hours, however many there are.
 *
 * ONE email per learner, ever (one free trial per person): the trial_reminders row is the dedupe, claimed BEFORE the
 * send and released again if the send fails, so the next sweep retries while the trial is still inside the window. A
 * learner who has already turned renewal off is not emailed.
 *
 * OFF by default. TRIAL_REMINDER_ENABLED must be exactly "true" on the web project (docs/ENV-SETUP.md). When it is off
 * this does nothing at all: no database read, no RevenueCat call, no email.
 *
 * Privacy: the address is read for one send and goes nowhere else; logs carry counts and words only.
 */
export type TrialReminderStore = {
  /**
   * Accounts active on or after `sinceDay` (YYYY-MM-DD) that have not been reminded and have not been checked since
   * `checkedBefore`: never-checked first, then least recently checked; at most `limit`.
   */
  candidates(sinceDay: string, checkedBefore: Date, limit: number): Promise<string[]>;
  /** Records that this learner's trial state was just read. */
  markChecked(userId: string, at: Date): Promise<void>;
  /** True if this caller recorded the reminder; false when one already exists. */
  claim(userId: string, trialEndsAt: Date): Promise<boolean>;
  /** Removes a claim whose send failed. */
  release(userId: string): Promise<void>;
};

export type TrialReminderDeps = {
  enabled: boolean;
  now: () => Date;
  /** Waits this long between reads; tests pass a recorder. */
  sleep: (ms: number) => Promise<void>;
  store: TrialReminderStore;
  /** The learner's running trial, or null. Throws when RevenueCat cannot be read (a RevenueCatHttpError carries its status). */
  readTrial: (userId: string) => Promise<TrialRead | null>;
  /** The plan and price for the product, as RevenueCat reports them; empty fields when it cannot say. */
  planFor: (productId: string) => Promise<PlanDetails>;
  /** The learner's own country (profile), for the price rule; null when unknown. */
  countryOf: (userId: string) => Promise<string | null>;
  /** The account's address, or null. */
  emailOf: (userId: string) => Promise<string | null>;
  sendEmail: (msg: EmailMessage) => Promise<void>;
  /** The sender; empty means no sender is configured and nothing is sent. */
  from: string;
};

export type TrialReminderResult = {
  /**
   * "off", "no-sender", "done" (every due learner was read), "budget" (time ran out; the next sweep continues) or
   * "rate-limited" (RevenueCat said 429 or kept failing; the next sweep tries again).
   */
  status: "off" | "no-sender" | "done" | "budget" | "rate-limited";
  checked: number;
  sent: number;
  failed: number;
};

const BATCH = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

const statusOf = (e: unknown): number | null =>
  typeof (e as { status?: unknown })?.status === "number" ? (e as { status: number }).status : null;

export async function sweepTrialReminders(deps: TrialReminderDeps): Promise<TrialReminderResult> {
  const result: TrialReminderResult = { status: "off", checked: 0, sent: 0, failed: 0 };
  if (!deps.enabled) return result;
  if (!deps.from) {
    console.error("[trial-reminder] not run: no sender is configured (SUPPORT_NOTIFY_FROM)");
    return { ...result, status: "no-sender" };
  }
  const start = deps.now();
  const deadline = start.getTime() + SWEEP_BUDGET_MS;
  const since = new Date(start.getTime() - CANDIDATE_ACTIVE_DAYS * DAY_MS)
    .toISOString()
    .slice(0, 10);
  const ids = await deps.store.candidates(
    since,
    new Date(start.getTime() - RECHECK_AFTER_MS),
    BATCH,
  );
  result.status = "done";

  let serverErrorsInARow = 0;
  for (const userId of ids) {
    if (deps.now().getTime() >= deadline) {
      result.status = "budget";
      break;
    }
    if (result.checked > 0) await deps.sleep(GAP_BETWEEN_READS_MS);
    result.checked += 1;
    try {
      const trial = await deps.readTrial(userId);
      serverErrorsInARow = 0;
      // Read: remember it now, so a cut-off sweep carries on from here and this learner waits their 20 hours.
      await deps.store.markChecked(userId, deps.now());
      if (!trial || !needsReminder(trial, deps.now())) continue;
      const to = await deps.emailOf(userId);
      if (!to) continue;
      if (!(await deps.store.claim(userId, trial.trialEndsAt))) continue;
      try {
        const plan = priceToShow(
          trial,
          await deps.planFor(trial.productId),
          await deps.countryOf(userId),
        );
        const mail = buildTrialReminderEmail(trial, plan, manageUrlFor(trial));
        await deps.sendEmail({ from: deps.from, to, subject: mail.subject, text: mail.text });
        result.sent += 1;
      } catch (e) {
        await deps.store.release(userId);
        throw e;
      }
    } catch (e) {
      result.failed += 1;
      const status = statusOf(e);
      // The message carries a status or a code, never an address.
      console.error(
        "[trial-reminder] one learner failed:",
        e instanceof Error ? e.message : "error",
      );
      if (status === 429) {
        result.status = "rate-limited";
        break;
      }
      serverErrorsInARow = status !== null && status >= 500 ? serverErrorsInARow + 1 : 0;
      if (serverErrorsInARow >= MAX_CONSECUTIVE_5XX) {
        result.status = "rate-limited";
        break;
      }
    }
  }
  return result;
}

// ---- production wiring ----

type Res = { data: unknown; error: { message: string; code?: string } | null };
const must = (r: Res, what: string) => {
  if (r.error) throw new Error(`${what} failed`);
  return r.data;
};

/** The store over the service-role client (these tables are not in the generated types until the migration deploys). */
export function supabaseTrialReminderStore(db: unknown): TrialReminderStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tables are not in the generated types yet
  const admin = db as any;
  return {
    async candidates(sinceDay, checkedBefore, limit) {
      const rows = (must(
        await admin.rpc("trial_reminder_candidates", {
          p_active_since: sinceDay,
          p_checked_before: checkedBefore.toISOString(),
          p_limit: limit,
        }),
        "candidate read",
      ) ?? []) as { user_id: string }[];
      return rows.map((r) => r.user_id);
    },
    async markChecked(userId, at) {
      must(
        await admin
          .from("trial_reminder_checked")
          .upsert({ user_id: userId, checked_at: at.toISOString() }, { onConflict: "user_id" }),
        "check record",
      );
    },
    async claim(userId, trialEndsAt) {
      const r = (await admin
        .from("trial_reminders")
        .insert({ user_id: userId, trial_ends_at: trialEndsAt.toISOString() })) as Res;
      if (r.error?.code === "23505") return false;
      must(r, "reminder claim");
      return true;
    },
    async release(userId) {
      must(await admin.from("trial_reminders").delete().eq("user_id", userId), "claim release");
    },
  };
}

export async function defaultTrialReminderDeps(): Promise<TrialReminderDeps> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendEmailViaResend } = await import("./report-notify.server");
  const { DEFAULT_SUPPORT_FROM } = await import("./support-notify.server");
  const { revenueCatConfigFromEnv, getAccountTrialSubscription } =
    await import("./revenuecat-entitlement");
  const { getWebOffering } = await import("./web-offering.server");
  const config = revenueCatConfigFromEnv();
  return {
    // Without the RevenueCat key there is nothing to ask, so the step stays off however the switch is set.
    enabled: reminderEnabled() && config !== null,
    now: () => new Date(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    store: supabaseTrialReminderStore(supabaseAdmin),
    readTrial: (userId) => getAccountTrialSubscription(config!, userId),
    async planFor(productId) {
      const offer = await getWebOffering(config!, productId).catch(() => null);
      return {
        period: offer?.period ?? null,
        price: offer?.price ?? null,
        priceCountry: offer?.priceCountry ?? null,
      };
    },
    async countryOf(userId) {
      const { data } = await supabaseAdmin
        .from("profiles")
        .select("country")
        .eq("id", userId)
        .maybeSingle();
      return data?.country ?? null;
    },
    async emailOf(userId) {
      const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
      return data.user?.email ?? null;
    },
    sendEmail: (m) => sendEmailViaResend(m),
    from:
      process.env.TRIAL_REMINDER_FROM || process.env.SUPPORT_NOTIFY_FROM || DEFAULT_SUPPORT_FROM,
  };
}
