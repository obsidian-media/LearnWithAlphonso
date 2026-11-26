import type { EmailMessage } from "./report-notify.server";
import type { TrialRead } from "./revenuecat-entitlement";
import {
  CANDIDATE_ACTIVE_DAYS,
  SCAN_EVERY_MS,
  buildTrialReminderEmail,
  manageUrlFor,
  needsReminder,
  reminderEnabled,
  type PlanDetails,
} from "./trial-reminder";

/**
 * The trial-ending reminder (docs/OPEN-ITEMS.md item 94), run from the 15-minute maintenance sweep
 * (src/lib/maintenance.server.ts). RevenueCat has no "who is in a trial" query and sends no webhook here, so the scan
 * asks RevenueCat about each recently active account, about once a day, and emails the ones whose trial ends within
 * 3 days. ONE email per learner, ever (one free trial per person): the trial_reminders row is the dedupe, claimed
 * BEFORE the send, and released again if the send fails so the next scan retries while the trial is still inside the
 * window. A learner who has already turned renewal off is not emailed.
 *
 * OFF by default. TRIAL_REMINDER_ENABLED must be "true" on the web project (docs/ENV-SETUP.md). When it is off this
 * does nothing at all: no database read, no RevenueCat call, no email.
 *
 * Privacy: the address is read for one send and goes nowhere else; logs carry counts and words only.
 */
export type TrialReminderStore = {
  /** True for the one caller that wins the right to scan now (the last scan was long enough ago). */
  claimScan(now: Date, minGapMs: number): Promise<boolean>;
  /** Accounts active on or after `sinceDay` (YYYY-MM-DD) that have not been reminded, at most `limit`. */
  candidates(sinceDay: string, limit: number): Promise<string[]>;
  /** True if this caller recorded the reminder; false when one already exists. */
  claim(userId: string, trialEndsAt: Date): Promise<boolean>;
  /** Removes a claim whose send failed. */
  release(userId: string): Promise<void>;
};

export type TrialReminderDeps = {
  enabled: boolean;
  now: () => Date;
  store: TrialReminderStore;
  /** The learner's running trial, or null. Throws when RevenueCat cannot be read. */
  readTrial: (userId: string) => Promise<TrialRead | null>;
  /** The plan and price for the product, as RevenueCat reports them; empty fields when it cannot say. */
  planFor: (productId: string) => Promise<PlanDetails>;
  /** The account's address, or null. */
  emailOf: (userId: string) => Promise<string | null>;
  sendEmail: (msg: EmailMessage) => Promise<void>;
  /** The sender; empty means no sender is configured and nothing is sent. */
  from: string;
};

export type TrialReminderResult = {
  /** "off", "no-sender", "not-due" (scanned recently) or "scanned". */
  status: "off" | "no-sender" | "not-due" | "scanned";
  checked: number;
  sent: number;
  failed: number;
};

const MAX_CANDIDATES = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function sweepTrialReminders(deps: TrialReminderDeps): Promise<TrialReminderResult> {
  const result: TrialReminderResult = { status: "off", checked: 0, sent: 0, failed: 0 };
  if (!deps.enabled) return result;
  if (!deps.from) {
    console.error("[trial-reminder] not run: no sender is configured (SUPPORT_NOTIFY_FROM)");
    return { ...result, status: "no-sender" };
  }
  const now = deps.now();
  if (!(await deps.store.claimScan(now, SCAN_EVERY_MS))) return { ...result, status: "not-due" };
  result.status = "scanned";

  const since = new Date(now.getTime() - CANDIDATE_ACTIVE_DAYS * DAY_MS).toISOString().slice(0, 10);
  const ids = await deps.store.candidates(since, MAX_CANDIDATES);
  for (const userId of ids) {
    result.checked += 1;
    try {
      const trial = await deps.readTrial(userId);
      if (!trial || !needsReminder(trial, now)) continue;
      const to = await deps.emailOf(userId);
      if (!to) continue;
      if (!(await deps.store.claim(userId, trial.trialEndsAt))) continue;
      try {
        const plan = await deps.planFor(trial.productId);
        const mail = buildTrialReminderEmail(trial, plan, manageUrlFor(trial));
        await deps.sendEmail({ from: deps.from, to, subject: mail.subject, text: mail.text });
        result.sent += 1;
      } catch (e) {
        await deps.store.release(userId);
        throw e;
      }
    } catch (e) {
      // One learner failing never stops the rest. The message carries a status or a code, never an address.
      result.failed += 1;
      console.error(
        "[trial-reminder] one learner failed:",
        e instanceof Error ? e.message : "error",
      );
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
    async claimScan(now, minGapMs) {
      const before = new Date(now.getTime() - minGapMs).toISOString();
      const r = (await admin
        .from("trial_reminder_scan")
        .update({ last_scan_at: now.toISOString() })
        .eq("id", true)
        .lt("last_scan_at", before)
        .select("id")) as Res;
      return ((must(r, "scan claim") as unknown[] | null) ?? []).length > 0;
    },
    async candidates(sinceDay, limit) {
      const rows = (must(
        await admin
          .from("activity_days")
          .select("user_id")
          .gte("day", sinceDay)
          .order("day", { ascending: false })
          .limit(limit * 4),
        "candidate read",
      ) ?? []) as { user_id: string }[];
      const unique = [...new Set(rows.map((r) => r.user_id))];
      if (unique.length === 0) return [];
      const done = (must(
        await admin.from("trial_reminders").select("user_id").in("user_id", unique),
        "reminder read",
      ) ?? []) as { user_id: string }[];
      const had = new Set(done.map((r) => r.user_id));
      return unique.filter((id) => !had.has(id)).slice(0, limit);
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
      await admin.from("trial_reminders").delete().eq("user_id", userId);
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
    store: supabaseTrialReminderStore(supabaseAdmin),
    readTrial: (userId) => getAccountTrialSubscription(config!, userId),
    async planFor(productId) {
      const offer = await getWebOffering(config!, productId).catch(() => null);
      return { period: offer?.period ?? null, price: offer?.price ?? null };
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
