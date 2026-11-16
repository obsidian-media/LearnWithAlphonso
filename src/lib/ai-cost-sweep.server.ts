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
export type AiCostSweepResult = { rolledUp: number; alert: AlertOutcome };

/** The UTC date (YYYY-MM-DD) before `now`'s. */
export function yesterdayUtc(now: Date): string {
  return new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
}

/** The alert only looks once a day is over and its late writes have landed. */
export const ALERT_AFTER_UTC_HOUR = 1;

const notDeployed = (e: { message: string; code?: string }) =>
  e.code === "PGRST202" ||
  e.code === "42883" ||
  /could not find the function|does not exist/i.test(e.message);

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

export async function sweepAiCost(deps: AiCostSweepDeps): Promise<AiCostSweepResult> {
  const result: AiCostSweepResult = { rolledUp: 0, alert: "none" };

  try {
    const { data, error } = await deps.rpc("rollup_ai_cost_log", { p_keep_days: 90 });
    if (error) {
      if (!notDeployed(error)) console.error("[ai-cost] rollup failed:", error.message);
    } else if (typeof data === "number") {
      result.rolledUp = data;
    }
  } catch (e) {
    console.error("[ai-cost] rollup failed:", e instanceof Error ? e.message : "error");
  }

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
    if (!notDeployed(claim.error))
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
