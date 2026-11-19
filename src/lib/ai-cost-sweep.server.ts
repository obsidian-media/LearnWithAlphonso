import type { EmailMessage } from "./report-notify.server";
import { MICRO } from "./ai-cost";
import type { CostConfig } from "./ai-cost-config";

/**
 * The AI cost log's scheduled share, run from the 15-minute maintenance sweep (maintenance.server.ts):
 *   1. rollup_ai_cost_log: raw rows older than 90 days become one row per day, learner, kind and vendor. Idempotent,
 *      and a no-op when nothing is that old, so running it every pass costs nothing.
 *   2. The daily spend alert: once per UTC day (the claim row in ai_cost_alert_days), after 01:00 UTC, look at
 *      YESTERDAY. If the total reached AI_COST_ALERT_DAILY_TOTAL_USD, or any one learner reached
 *      AI_COST_ALERT_DAILY_USER_USD, email the owner. A learner appears only as the first 8 characters of their id.
 *
 *   3. The spend circuit breaker, every pass: when TODAY's estimated total reaches AI_SPEND_BREAKER_DAILY_USD the "ai"
 *      switch (app_switches, the owner's off switch) is turned off by trip_ai_spend_breaker, which flips it in one
 *      statement, so exactly one pass sees the trip and sends the one email. It never turns anything back on: see
 *      docs/operations.md ("AI spend circuit breaker") for the reset.
 *
 * Failure rules: a send that fails releases the claim, so the next pass tries again; a missing recipient or sender is
 * logged and skipped (the claim stays, the day is not retried every 15 minutes), never a crash. A database that does
 * not have the functions yet (the migration is applied at deploy) skips quietly.
 */

type RpcResult = { data: unknown; error: { message: string; code?: string } | null };
export type AiCostSweepDeps = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
  now: () => Date;
  send: (msg: EmailMessage) => Promise<void>;
  /** REPORT_NOTIFY_TO; empty = nowhere to send. */
  ownerEmail: string;
  /** SUPPORT_NOTIFY_FROM; empty = no sender. */
  from: string;
  cfg: CostConfig;
};

export type DayReport = {
  day: string;
  totalMicro: number;
  calls: number;
  unpriced: number;
  overCount: number;
  overUsers: { id: string; micro: number }[];
};

export type AlertOutcome = "none" | "sent" | "skipped" | "failed";
export type BreakerOutcome = "tripped" | "emailed" | "failed";
/** `breaker` is present only when the breaker tripped (or failed to be asked); a quiet pass leaves it out. */
export type AiCostSweepResult = { rolledUp: number; alert: AlertOutcome; breaker?: BreakerOutcome };

/** The UTC date (YYYY-MM-DD) before `now`'s. */
export function yesterdayUtc(now: Date): string {
  return new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
}

/** The alert only looks once a day is over and its late writes have landed. */
export const ALERT_AFTER_UTC_HOUR = 1;

/**
 * True only when `fn` itself is missing: PostgREST's "not in the schema cache" (PGRST202), or Postgres's 42883 naming
 * `fn`. A 42883 or "does not exist" raised INSIDE the function (a helper it calls was renamed) is a real failure.
 */
const notDeployed = (e: { message: string; code?: string }, fn: string) =>
  e.code === "PGRST202" || (e.code === "42883" && e.message.includes(fn));

export function parseDayReport(raw: unknown): DayReport {
  const r = raw as Record<string, unknown> | null;
  const n = (v: unknown) => {
    if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("bad day report");
    return v;
  };
  if (!r || typeof r !== "object" || !Array.isArray(r.overUsers) || typeof r.day !== "string")
    throw new Error("bad day report");
  return {
    day: r.day,
    totalMicro: n(r.totalMicro),
    calls: n(r.calls),
    unpriced: n(r.unpriced),
    overCount: n(r.overCount),
    overUsers: r.overUsers.map((u) => {
      const o = u as { id?: unknown; micro?: unknown };
      if (typeof o.id !== "string") throw new Error("bad day report");
      return { id: o.id, micro: n(o.micro) };
    }),
  };
}

export function alertExceeded(report: DayReport, cfg: CostConfig): boolean {
  return report.totalMicro >= cfg.dailyTotalUsd * MICRO || report.overCount > 0;
}

export type BreakerTrip = { tripped: boolean; totalMicro: number };

export function parseBreakerTrip(raw: unknown): BreakerTrip {
  const r = raw as { tripped?: unknown; totalMicro?: unknown } | null;
  if (!r || typeof r.tripped !== "boolean" || typeof r.totalMicro !== "number") {
    throw new Error("bad breaker answer");
  }
  return { tripped: r.tripped, totalMicro: r.totalMicro };
}

const dollars = (micro: number) => `$${(micro / MICRO).toFixed(micro >= 10 * MICRO ? 2 : 3)}`;

export function buildAlertEmail(
  report: DayReport,
  cfg: CostConfig,
  to: string,
  from: string,
): EmailMessage {
  const lines = [
    `Estimated AI spend for ${report.day} (UTC): ${dollars(report.totalMicro)} across ${report.calls} call(s).`,
    "",
    report.totalMicro >= cfg.dailyTotalUsd * MICRO
      ? `That is at or over the daily total alert of $${cfg.dailyTotalUsd}.`
      : `The daily total alert is $${cfg.dailyTotalUsd}; the total stayed under it.`,
  ];
  if (report.overCount > 0) {
    lines.push(
      "",
      `${report.overCount} learner(s) reached the per-learner alert of $${cfg.dailyUserUsd} that day` +
        (report.overCount > report.overUsers.length
          ? ` (the top ${report.overUsers.length} are listed)`
          : "") +
        ":",
      ...report.overUsers.map((u) => `- ${u.id}  ${dollars(u.micro)}`),
      "",
      "The id is the first 8 characters of the learner id; find the account in the admin console.",
    );
  }
  if (report.unpriced > 0) {
    lines.push(
      "",
      `${report.unpriced} call(s) had no known price and are not in the totals (add the model to src/lib/ai-prices.ts).`,
    );
  }
  lines.push(
    "",
    "Figures are estimates: the vendor's own charge when it reported one, otherwise our price table.",
    "Thresholds: AI_COST_ALERT_DAILY_TOTAL_USD and AI_COST_ALERT_DAILY_USER_USD (see docs/operations.md).",
  );
  return {
    from,
    to,
    subject: `[Alphonso] AI spend alert for ${report.day}: ${dollars(report.totalMicro)}`,
    text: lines.join("\n"),
  };
}

export function buildBreakerEmail(
  trip: BreakerTrip,
  cfg: CostConfig,
  to: string,
  from: string,
): EmailMessage {
  return {
    from,
    to,
    subject: `[Alphonso] AI switched OFF: today's spend reached ${dollars(trip.totalMicro)}`,
    text: [
      `Today's estimated AI spend (UTC) reached ${dollars(trip.totalMicro)}, at or over the circuit breaker of $${cfg.breakerDailyUsd}.`,
      "",
      'The AI switch is now OFF: conversation, speech, AI grading, word lookup and the tutor return "ai-unavailable". Lessons, reviews and progress still work.',
      "",
      "Nothing turns it back on by itself. To look: the admin console Numbers page, then the AI cost group (heaviest learners).",
      "To turn AI back on (after raising AI_SPEND_BREAKER_DAILY_USD on Vercel, or after the UTC day changes):",
      "  UPDATE public.app_switches SET enabled = true, note = NULL, updated_at = now() WHERE key = 'ai';",
      "It takes effect within 30 seconds on every server. If today's spend is still over the breaker and the setting is unchanged, the next 15-minute pass trips it again.",
      "",
      "Figures are estimates (the vendor's charge when it reported one, otherwise our price table). Setting: AI_SPEND_BREAKER_DAILY_USD (see docs/operations.md).",
    ].join("\n"),
  };
}

/** One pass of the breaker. Never throws; a database without the function yet skips quietly. */
async function runBreaker(deps: AiCostSweepDeps, result: AiCostSweepResult): Promise<void> {
  if (!deps.cfg.breakerEnabled) return;
  let trip: BreakerTrip;
  try {
    const { data, error } = await deps.rpc("trip_ai_spend_breaker", {
      p_limit_micro: Math.round(deps.cfg.breakerDailyUsd * MICRO),
    });
    if (error) {
      if (!notDeployed(error, "trip_ai_spend_breaker")) {
        console.error("[ai-cost] breaker check failed:", error.message);
        result.breaker = "failed";
      }
      return;
    }
    trip = parseBreakerTrip(data);
  } catch (e) {
    console.error("[ai-cost] breaker check failed:", e instanceof Error ? e.message : "error");
    result.breaker = "failed";
    return;
  }
  if (!trip.tripped) return;
  result.breaker = "tripped";
  console.error(
    `[ai-cost] BREAKER TRIPPED: AI switched off, today's estimated spend ${dollars(trip.totalMicro)} >= $${deps.cfg.breakerDailyUsd}`,
  );
  // The switch is already off; the email is a notice. It is not retried (the trip happens once), so a missing
  // recipient or a failed send is logged loudly above and here.
  if (!deps.ownerEmail || !deps.from) {
    console.error(
      "[ai-cost] breaker email NOT sent: REPORT_NOTIFY_TO or SUPPORT_NOTIFY_FROM is not set",
    );
    return;
  }
  try {
    await deps.send(buildBreakerEmail(trip, deps.cfg, deps.ownerEmail, deps.from));
    result.breaker = "emailed";
  } catch (e) {
    console.error("[ai-cost] breaker email failed:", e instanceof Error ? e.message : "error");
  }
}

export async function sweepAiCost(deps: AiCostSweepDeps): Promise<AiCostSweepResult> {
  const result: AiCostSweepResult = { rolledUp: 0, alert: "none" };

  try {
    const { data, error } = await deps.rpc("rollup_ai_cost_log", { p_keep_days: 90 });
    if (error) {
      if (!notDeployed(error, "rollup_ai_cost_log"))
        console.error("[ai-cost] rollup failed:", error.message);
    } else if (typeof data === "number") {
      result.rolledUp = data;
    }
  } catch (e) {
    console.error("[ai-cost] rollup failed:", e instanceof Error ? e.message : "error");
  }

  await runBreaker(deps, result);

  const now = deps.now();
  if (now.getUTCHours() < ALERT_AFTER_UTC_HOUR) return result;
  const day = yesterdayUtc(now);

  let claim: Awaited<ReturnType<AiCostSweepDeps["rpc"]>>;
  try {
    claim = await deps.rpc("claim_ai_cost_alert_day", { p_day: day });
  } catch (e) {
    console.error("[ai-cost] alert claim failed:", e instanceof Error ? e.message : "error");
    return result;
  }
  if (claim.error) {
    if (!notDeployed(claim.error, "claim_ai_cost_alert_day"))
      console.error("[ai-cost] alert claim failed:", claim.error.message);
    return result;
  }
  if (claim.data !== true) return result;

  const release = async () => {
    try {
      await deps.rpc("release_ai_cost_alert_day", { p_day: day });
    } catch {
      // The next pass finds the claim still held and does nothing; the alert for this day is lost, loudly logged above.
    }
  };

  let report: DayReport;
  try {
    const { data, error } = await deps.rpc("ai_cost_day_report", {
      p_day: day,
      p_user_micro: Math.round(deps.cfg.dailyUserUsd * MICRO),
    });
    if (error) throw new Error(error.message);
    report = parseDayReport(data);
  } catch (e) {
    console.error("[ai-cost] day report failed:", e instanceof Error ? e.message : "error");
    await release();
    result.alert = "failed";
    return result;
  }

  if (!alertExceeded(report, deps.cfg)) return result;

  if (!deps.ownerEmail || !deps.from) {
    console.error(
      `[ai-cost] spend alert for ${day} NOT sent: ${!deps.ownerEmail ? "REPORT_NOTIFY_TO" : "SUPPORT_NOTIFY_FROM"} is not set`,
    );
    result.alert = "skipped";
    return result;
  }
  try {
    await deps.send(buildAlertEmail(report, deps.cfg, deps.ownerEmail, deps.from));
    result.alert = "sent";
  } catch (e) {
    console.error("[ai-cost] spend alert email failed:", e instanceof Error ? e.message : "error");
    await release();
    result.alert = "failed";
  }
  return result;
}

/** Production wiring: the service-role client and the existing email path (Resend, REPORT_NOTIFY_TO, SUPPORT_NOTIFY_FROM). */
export async function defaultAiCostDeps(): Promise<AiCostSweepDeps> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendEmailViaResend } = await import("./report-notify.server");
  const { costConfig } = await import("./ai-cost-config");
  return {
    rpc: (fn, args) => (supabaseAdmin as unknown as { rpc: AiCostSweepDeps["rpc"] }).rpc(fn, args),
    now: () => new Date(),
    send: (m) => sendEmailViaResend(m),
    ownerEmail: process.env.REPORT_NOTIFY_TO ?? "",
    from: process.env.SUPPORT_NOTIFY_FROM ?? "",
    cfg: costConfig(process.env),
  };
}
