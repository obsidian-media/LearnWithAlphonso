import type { OpsHealth } from "./ops-health.server";

/**
 * The Health screen's data and the pure rules that turn raw readings into what the screen says. No server import, no
 * environment access: the screen and its tests use this file, the server builds the values.
 *
 * The rules the owner set ("nothing hardcoded, everything real"):
 *   - A service with no real reading is "unknown" (or "not_connected" when the provider's key is absent): grey, never green.
 *   - The banner never says everything is fine while any row is unknown or not connected.
 *   - An uptime day with no rows is "nodata" (grey), never "up". The percentage covers only days that have data.
 */

export type ServiceKey = "database" | "auth" | "ai" | "payments" | "jobs";

/**
 * healthy        a live check passed
 * degraded       a live check failed or timed out, or something that should be running is not
 * configured     the key or switch is in place but nothing probes the provider (no live check exists)
 * not_connected  the provider's key is absent
 * unknown        nothing could be read
 */
export type ServiceState = "healthy" | "degraded" | "configured" | "not_connected" | "unknown";

export type UptimeBar = { day: string; state: "up" | "partial" | "down" | "nodata" };
export type Uptime = {
  /** Oldest first, one per UTC day, always `UPTIME_DAYS` long. */
  bars: UptimeBar[];
  /** Passing checks over all checks, across the days that have data only; null when no day has data. */
  percent: number | null;
  /** How many days have at least one check. */
  daysWithData: number;
  /** The first check on record (ISO), or null when there is none. */
  firstAt: string | null;
};

export type ServiceRow = {
  key: ServiceKey;
  name: string;
  /** A fixed description or a real flag state ("Two-step (AAL2) enforced"); never a number. */
  detail: string | null;
  state: ServiceState;
  /** Why the state is not healthy, in words. */
  reason: string | null;
  /** The live probe's time, only when a probe finished. */
  latencyMs: number | null;
  /** Null when this service has no stored history (or it could not be read: see `uptimeError`). */
  uptime: Uptime | null;
  uptimeError: boolean;
  /** Background jobs only. */
  jobs: { lastRunAt: string | null; runs24h: number; failed24h: number } | null;
};

export type HealthData = {
  checkedAt: string;
  services: ServiceRow[];
  /** The real flag state: ADMIN_REQUIRE_AAL2 is anything but "false". */
  aal2Enforced: boolean;
  /** The ops events (counts and the latest rows), or null when they could not be read. */
  ops: OpsHealth | null;
  opsError: string | null;
};

export const UPTIME_DAYS = 90;

export type HistoryRow = { service: string; day: string; checks: number; okChecks: number };

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** The bars for one service. Every day in the window is present; a day with no rows is "nodata". */
export function buildUptime(
  rows: readonly HistoryRow[],
  firstAt: string | null,
  now: Date,
  days: number = UPTIME_DAYS,
): Uptime {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const bars: UptimeBar[] = [];
  let checks = 0;
  let ok = 0;
  let withData = 0;
  for (let i = days - 1; i >= 0; i--) {
    const day = dayKey(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i)),
    );
    const r = byDay.get(day);
    if (!r || r.checks <= 0) {
      bars.push({ day, state: "nodata" });
      continue;
    }
    withData++;
    checks += r.checks;
    ok += r.okChecks;
    bars.push({
      day,
      state: r.okChecks >= r.checks ? "up" : r.okChecks <= 0 ? "down" : "partial",
    });
  }
  return {
    bars,
    percent: checks > 0 ? Math.round((ok / checks) * 10000) / 100 : null,
    daysWithData: withData,
    firstAt,
  };
}

/** A state that counts as "we could not tell": the banner must not call the system fine while one exists. */
export const isUncertain = (s: ServiceState) => s === "unknown" || s === "not_connected";

export type Banner =
  | { kind: "degraded"; degraded: number; unchecked: number }
  | { kind: "unchecked"; unchecked: number; configuredOnly: number }
  | { kind: "ok"; configuredOnly: number };

/** What the banner says, from the rows. Counts only: the screen writes them with <Figure>. */
export function deriveBanner(services: readonly ServiceRow[]): Banner {
  const degraded = services.filter((s) => s.state === "degraded").length;
  const unchecked = services.filter((s) => isUncertain(s.state)).length;
  const configuredOnly = services.filter((s) => s.state === "configured").length;
  if (degraded > 0) return { kind: "degraded", degraded, unchecked };
  if (unchecked > 0) return { kind: "unchecked", unchecked, configuredOnly };
  return { kind: "ok", configuredOnly };
}

/** The oldest a successful maintenance run may be before the job counts as stalled (three 15 minute cycles). */
export const SWEEP_STALE_MINUTES = 45;

export type SweepRaw = {
  scheduled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  runs24h: number;
  failed24h: number;
};

/** The state of the background jobs row from what pg_cron recorded. */
export function jobsState(
  sweep: SweepRaw | null,
  now: Date,
): { state: ServiceState; reason: string | null } {
  if (!sweep) return { state: "unknown", reason: "Could not read the job log" };
  if (!sweep.scheduled)
    return { state: "degraded", reason: "The maintenance job is not scheduled" };
  if (!sweep.lastRunAt) return { state: "unknown", reason: "No run recorded yet" };
  if (sweep.lastStatus === "failed") return { state: "degraded", reason: "The last run failed" };
  const ageMinutes = (now.getTime() - Date.parse(sweep.lastRunAt)) / 60_000;
  if (!Number.isFinite(ageMinutes))
    return { state: "unknown", reason: "Could not read the job log" };
  if (ageMinutes > SWEEP_STALE_MINUTES)
    return { state: "degraded", reason: `No run in the last ${SWEEP_STALE_MINUTES} minutes` };
  return { state: "healthy", reason: null };
}
