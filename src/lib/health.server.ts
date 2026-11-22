import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildUptime,
  jobsState,
  type HealthData,
  type HistoryRow,
  type ServiceRow,
  type SweepRaw,
} from "./health-core";
import { parseLlmChatModels } from "./llm-chat-model.server";
import { readOpsHealth } from "./ops-health.server";
import { callRpc } from "./untyped-rpc";

/**
 * The Health screen's read (service role). Two live probes (database, auth) with a short timeout, the stored history,
 * the maintenance job's log, and the presence (never the value) of the AI and RevenueCat settings. A probe that does
 * not answer in time is DEGRADED with its reason; it is never left out.
 */

export const PROBE_TIMEOUT_MS = 3000;

export type ProbeResult = { ok: true; ms: number } | { ok: false; reason: string };

/** Times `run`. It must resolve (a failure the caller maps to a reason) within `timeoutMs`, else it is a timeout. */
export async function timedProbe(
  run: () => PromiseLike<{ failed: boolean }>,
  timeoutMs: number = PROBE_TIMEOUT_MS,
  failedReason = "It answered with an error",
): Promise<ProbeResult> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const outcome = await Promise.race([
      Promise.resolve(run()).then((r) => ({ kind: "done" as const, failed: r.failed })),
      new Promise<{ kind: "timeout" }>((resolve) => {
        timer = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
      }),
    ]);
    if (outcome.kind === "timeout")
      return { ok: false, reason: `No answer within ${Math.round(timeoutMs / 1000)} seconds` };
    if (outcome.failed) return { ok: false, reason: failedReason };
    return { ok: true, ms: Date.now() - started };
  } catch {
    return { ok: false, reason: failedReason };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type Probes = { database: () => Promise<ProbeResult>; auth: () => Promise<ProbeResult> };

/** The real probes: a one row read of an application table, and the auth admin API listing one user. */
export function liveProbes(db: SupabaseClient): Probes {
  return {
    database: () =>
      timedProbe(
        async () => ({ failed: !!(await db.from("app_switches").select("key").limit(1)).error }),
        PROBE_TIMEOUT_MS,
        "The database answered with an error",
      ),
    auth: () =>
      timedProbe(
        async () => ({ failed: !!(await db.auth.admin.listUsers({ page: 1, perPage: 1 })).error }),
        PROBE_TIMEOUT_MS,
        "The sign-in service answered with an error",
      ),
  };
}

const finite = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const iso = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

async function readSweep(db: SupabaseClient): Promise<SweepRaw | null> {
  const { data, error } = await callRpc(db, "staff_sweep_status", {});
  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
  if (error || !row) return null;
  return {
    scheduled: row.scheduled === true,
    lastRunAt: iso(row.last_run_at),
    lastStatus: typeof row.last_status === "string" ? row.last_status : null,
    runs24h: finite(row.runs_24h) ?? 0,
    failed24h: finite(row.failed_24h) ?? 0,
  };
}

type Summary = { service: string; firstAt: string | null };

async function readHistory(
  db: SupabaseClient,
): Promise<{ rows: HistoryRow[]; summary: Summary[] } | null> {
  const [hist, sum] = await Promise.all([
    callRpc(db, "staff_health_history", { p_days: 90 }),
    callRpc(db, "staff_health_summary", {}),
  ]);
  if (hist.error || sum.error || !Array.isArray(hist.data) || !Array.isArray(sum.data)) return null;
  return {
    rows: (hist.data as Record<string, unknown>[]).map((r) => ({
      service: String(r.service),
      day: String(r.day).slice(0, 10),
      checks: finite(r.checks) ?? 0,
      okChecks: finite(r.ok_checks) ?? 0,
    })),
    summary: (sum.data as Record<string, unknown>[]).map((r) => ({
      service: String(r.service),
      firstAt: iso(r.first_at),
    })),
  };
}

/** `ai` switch: true / false, or null when it could not be read. */
async function readAiSwitch(db: SupabaseClient): Promise<boolean | null> {
  const { data, error } = await db
    .from("app_switches")
    .select("enabled")
    .eq("key", "ai")
    .maybeSingle();
  if (error || !data) return null;
  return data.enabled === true;
}

type Env = Record<string, string | undefined>;
const present = (v: string | undefined) => typeof v === "string" && v.trim() !== "";

export async function readHealth(
  db: SupabaseClient,
  env: Env,
  now: Date = new Date(),
  probes: Probes = liveProbes(db),
): Promise<HealthData> {
  const [dbProbe, authProbe, history, sweep, aiSwitch, ops] = await Promise.all([
    probes.database(),
    probes.auth(),
    readHistory(db),
    readSweep(db),
    readAiSwitch(db),
    readOpsHealth(db).then(
      (value) => ({ value, error: null as string | null }),
      () => ({ value: null, error: "Could not read the events." }),
    ),
  ]);

  const aal2Enforced = env.ADMIN_REQUIRE_AAL2 !== "false";

  const probed = (
    key: "database" | "auth",
    name: string,
    detail: string | null,
    r: ProbeResult,
  ): ServiceRow => {
    const rows = history?.rows.filter((h) => h.service === key) ?? [];
    const firstAt = history?.summary.find((s) => s.service === key)?.firstAt ?? null;
    return {
      key,
      name,
      detail,
      state: r.ok ? "healthy" : "degraded",
      reason: r.ok ? null : r.reason,
      latencyMs: r.ok ? r.ms : null,
      uptime: history ? buildUptime(rows, firstAt, now) : null,
      uptimeError: history === null,
      jobs: null,
    };
  };

  const hasAiKey = present(env.OPENROUTER_API_KEY);
  const model = parseLlmChatModels(env.LLM_CHAT_MODELS)[0];
  const ai: ServiceRow = {
    key: "ai",
    name: "AI provider",
    detail: hasAiKey ? `OpenRouter · ${model}` : "OpenRouter",
    ...(!hasAiKey
      ? { state: "not_connected" as const, reason: "No OpenRouter key is set" }
      : aiSwitch === false
        ? { state: "degraded" as const, reason: "Switched off in the app switches" }
        : aiSwitch === null
          ? { state: "unknown" as const, reason: "Could not read the AI switch" }
          : { state: "configured" as const, reason: "Key set and switch on. Not tested live" }),
    latencyMs: null,
    uptime: null,
    uptimeError: false,
    jobs: null,
  };

  const hasRevenueCat = present(env.REVENUECAT_METRICS_KEY) && present(env.REVENUECAT_PROJECT_ID);
  const payments: ServiceRow = {
    key: "payments",
    name: "Payments",
    detail: "RevenueCat",
    state: hasRevenueCat ? "configured" : "not_connected",
    reason: hasRevenueCat ? "Key set. Not tested live" : "No RevenueCat key is set",
    latencyMs: null,
    uptime: null,
    uptimeError: false,
    jobs: null,
  };

  const j = jobsState(sweep, now);
  const jobs: ServiceRow = {
    key: "jobs",
    name: "Background jobs",
    detail: "Maintenance, every 15 minutes",
    state: j.state,
    reason: j.reason,
    latencyMs: null,
    uptime: null,
    uptimeError: false,
    jobs: sweep
      ? { lastRunAt: sweep.lastRunAt, runs24h: sweep.runs24h, failed24h: sweep.failed24h }
      : null,
  };

  return {
    checkedAt: now.toISOString(),
    services: [
      probed("database", "Database", "Supabase · primary", dbProbe),
      probed(
        "auth",
        "Auth & sign-in",
        aal2Enforced ? "Two-step (AAL2) enforced" : "Two-step (AAL2) not enforced",
        authProbe,
      ),
      payments,
      ai,
      jobs,
    ],
    aal2Enforced,
    ops: ops.value,
    opsError: ops.error,
  };
}
