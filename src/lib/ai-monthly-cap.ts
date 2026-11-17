/**
 * The per-learner MONTHLY AI cost cap, as pure functions (no I/O; the server half is ai-monthly-cap.server.ts).
 *
 * Why it exists: the daily request caps (ai-quota.server.ts) bound requests, not cost, so a learner who maxes every
 * daily allowance every day can still cost far more than their price. This caps the measured cost (ai_cost_log +
 * ai_cost_daily, micro-USD) over the current UTC calendar month.
 *
 * Calendar month, not rolling 30 days: the learner is told one date it resets on ("1 December"), it lines up with the
 * store's billing month, and nobody can be capped by a spike that is still "30 days old" on the 31st. UTC, like the
 * daily quota and the cost log.
 *
 * Settings (environment, all optional; documented in docs/operations.md, "Monthly AI cost cap"):
 *   AI_MONTHLY_CAP_FREE_USD     a free learner's monthly AI cost ceiling (default 2)
 *   AI_MONTHLY_CAP_PRO_USD      a Pro learner's ceiling (default 8, never below the free one)
 *   AI_MONTHLY_CAP_WARN_PERCENT the share of the ceiling at which the soft warning starts (default 80)
 *   AI_MONTHLY_CAP_ENABLED      "false" turns the cap off (the kill switch); anything else leaves it on
 */
import { MICRO } from "./ai-cost";

/** The costly kinds the cap blocks. Lessons, review and reading call no AI and are never listed. The Help chat
 *  ("support") is deliberately absent: a learner who is capped must still be able to ask for help. */
export const MONTHLY_CAP_KINDS = [
  "chat",
  "hector",
  "tts",
  "stt",
  "recap",
  "explain",
  "translate",
  "define",
] as const;

export function isMonthlyCapKind(kind: string): boolean {
  return (MONTHLY_CAP_KINDS as readonly string[]).includes(kind);
}

export const MONTHLY_CAP_DEFAULTS = { freeUsd: 2, proUsd: 8, warnPercent: 80 } as const;

export type MonthlyCapConfig = {
  enabled: boolean;
  freeMicro: number;
  proMicro: number;
  /** 0 < warnShare < 1 */
  warnShare: number;
};

const positive = (raw: string | undefined, fallback: number): number => {
  const n = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function monthlyCapConfig(env: Record<string, string | undefined>): MonthlyCapConfig {
  const freeMicro = Math.round(
    positive(env.AI_MONTHLY_CAP_FREE_USD, MONTHLY_CAP_DEFAULTS.freeUsd) * MICRO,
  );
  const proMicro = Math.max(
    Math.round(positive(env.AI_MONTHLY_CAP_PRO_USD, MONTHLY_CAP_DEFAULTS.proUsd) * MICRO),
    freeMicro,
  );
  const pct = positive(env.AI_MONTHLY_CAP_WARN_PERCENT, MONTHLY_CAP_DEFAULTS.warnPercent);
  return {
    enabled: (env.AI_MONTHLY_CAP_ENABLED ?? "").trim().toLowerCase() !== "false",
    freeMicro,
    proMicro,
    warnShare: pct >= 100 ? MONTHLY_CAP_DEFAULTS.warnPercent / 100 : pct / 100,
  };
}

export type CapState = "ok" | "warn" | "capped";
export type CapStatus = { state: CapState; percentUsed: number };

/** capped at or over the ceiling; warn from warnShare of it; otherwise ok. A ceiling that is not positive never caps. */
export function evaluateCap(spentMicro: number, capMicro: number, warnShare: number): CapStatus {
  if (!(capMicro > 0) || !Number.isFinite(spentMicro) || spentMicro < 0) {
    return { state: "ok", percentUsed: 0 };
  }
  const percentUsed = Math.min(100, Math.floor((spentMicro / capMicro) * 100));
  if (spentMicro >= capMicro) return { state: "capped", percentUsed: 100 };
  if (spentMicro >= capMicro * warnShare) return { state: "warn", percentUsed };
  return { state: "ok", percentUsed };
}

/** Whether the spend is high enough that the learner's tier matters. Below the warning line of even the FREE
 *  ceiling the answer is "ok" for both tiers, so no entitlement lookup is made for the great majority of calls. */
export function needsTierLookup(spentMicro: number, cfg: MonthlyCapConfig): boolean {
  return spentMicro >= cfg.freeMicro * cfg.warnShare;
}

/** First instant of the current UTC month. */
export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** First instant of the next UTC month: when the cap resets. */
export function nextMonthStartUtc(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

/** A reset more than a day and a half away is a monthly reset (a daily or per-minute one is never that far). */
export const MONTHLY_RESET_MIN_MS = 36 * 3_600_000;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "1 December": the reset date, in UTC (the month boundary is UTC). */
export function resetDateLabel(resetsAt: string): string | null {
  const d = new Date(resetsAt);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** The learner-facing refusal. Kind: nothing about money, and it says what still works. */
export function monthlyCapMessage(resetsAt: string): string {
  const date = resetDateLabel(resetsAt);
  return date
    ? `You've hit this month's usage limit for AI practice. It resets on ${date}. Lessons and review still work.`
    : "You've hit this month's usage limit for AI practice. It resets at the start of next month. Lessons and review still work.";
}
