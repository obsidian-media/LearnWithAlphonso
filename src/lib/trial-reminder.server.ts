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
 * Bounded: a sweep stops reading after SWEEP_BUDGET_MS (the pg_net call to the route times out at 30 s) and never
 * starts a send past it, pauses between reads, and stops at once on a 429 or a 401 (a bad key: status "auth-failed",
 * nobody marked, one count-only ops event at most per day). Each learner read is recorded (trial_reminder_checked)
 * right away, so a cut-off sweep is simply continued by the next one. A read that fails for the learner's own reason
 * (a 403, a 404 or 422, a malformed body) marks them checked too: they are retried at the normal 20-hour cadence, so
 * the same failing learners are never re-read first on every sweep. A read that gets no answer or a 5xx is an outage:
 * the learner is left unchecked (retried first next sweep), and three outages in a row stop the sweep ("rate-limited")
 * and mark those three checked, so three adjacent always-failing learners cannot block every sweep forever.
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
  /** Records an operational event: counts and codes only, never personal data. Optional; must not throw. */
  recordEvent?: (
    event: string,
    detail: Record<string, string | number | boolean | null>,
  ) => Promise<void>;
  /** The sender; empty means no sender is configured and nothing is sent. */
  from: string;
};

export type TrialReminderResult = {
  /**
   * "off", "no-sender", "done" (every due learner was read), "budget" (time ran out; the next sweep continues) or
   * "rate-limited" (RevenueCat said 429 or kept failing; the next sweep tries again) or "auth-failed" (RevenueCat said
   * 401, so its key needs attention: nobody was marked).
   */
  status: "off" | "no-sender" | "done" | "budget" | "rate-limited" | "auth-failed";
  checked: number;
  sent: number;
  failed: number;
};

const BATCH = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

const statusOf = (e: unknown): number | null =>
  typeof (e as { status?: unknown })?.status === "number" ? (e as { status: number }).status : null;

const isMalformed = (e: unknown): boolean => (e as { malformed?: unknown })?.malformed === true;

async function markQuietly(deps: TrialReminderDeps, userId: string): Promise<void> {
  try {
    await deps.store.markChecked(userId, deps.now());
  } catch {
    console.error("[trial-reminder] could not record a failed read");
  }
}

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

  const outageStreak: string[] = [];
  for (const userId of ids) {
    if (deps.now().getTime() >= deadline) {
      result.status = "budget";
      break;
    }
    if (result.checked > 0) await deps.sleep(GAP_BETWEEN_READS_MS);
    result.checked += 1;
    let readDone = false;
    try {
      const trial = await deps.readTrial(userId);
      readDone = true;
      outageStreak.length = 0;
      // Never start a send past the budget. Not marked, so this learner is first in line for the next sweep.
      if (trial && needsReminder(trial, deps.now()) && deps.now().getTime() >= deadline) {
        result.status = "budget";
        break;
      }
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
      if (!readDone && status === 401) {
        // A bad key: every learner would fail the same way. Stop, and mark nobody.
        result.status = "auth-failed";
        await deps.recordEvent?.("trial_reminder_auth_failed", { status, read: result.checked });
        break;
      }
      // An outage: a 5xx, or no answer at all (network, timeout, DNS). Not the learner's fault, so not marked, unless
      // the streak reaches the stop; then the streak's learners are marked so they cannot block every later sweep.
      const outage = !readDone && !isMalformed(e) && (status === null || status >= 500);
      if (outage) {
        outageStreak.push(userId);
        if (outageStreak.length >= MAX_CONSECUTIVE_5XX) {
          result.status = "rate-limited";
          for (const id of outageStreak) await markQuietly(deps, id);
          break;
        }
        continue;
      }
      outageStreak.length = 0;
      // This learner's own failure (a 403, a 404 or 422, a malformed body): record that they were tried, so the same
      // failures are not re-read first on every sweep while everyone after them waits.
      if (!readDone) await markQuietly(deps, userId);
    }
  }
  return result;
}

/** Records an ops event unless one was already written in the last 24 h, so a standing fault is one row a day. Never throws. */
export async function recordOncePerDay(
  event: string,
  detail: Record<string, string | number | boolean | null>,
  recentlyRecorded: () => Promise<boolean>,
  record: (e: string, d: typeof detail) => Promise<void> = async (e, d) => {
    const { recordOpsEvent } = await import("./ops-events.server");
    await recordOpsEvent(e, d);
  },
): Promise<void> {
  try {
    if (await recentlyRecorded()) return;
    await record(event, detail);
  } catch {
    console.error("[trial-reminder] could not record an event");
  }
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
    recordEvent: (event, detail) =>
      recordOncePerDay(event, detail, async () => {
        const { data } = await supabaseAdmin
          .from("ops_events")
          .select("created_at")
          .eq("event", event)
          .gte("created_at", new Date(Date.now() - DAY_MS).toISOString())
          .limit(1);
        return (data?.length ?? 0) > 0;
      }),
    from:
      process.env.TRIAL_REMINDER_FROM || process.env.SUPPORT_NOTIFY_FROM || DEFAULT_SUPPORT_FROM,
  };
}
