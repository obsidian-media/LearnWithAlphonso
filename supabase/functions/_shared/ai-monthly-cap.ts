// The per-learner MONTHLY AI cost cap for the Edge Functions: a Deno-compatible port of src/lib/ai-monthly-cap.ts
// (the rules and defaults) and src/lib/ai-monthly-cap.server.ts (the failure rule). Keep the three in step.
//
// Settings are the SAME environment variables as the web server (AI_MONTHLY_CAP_FREE_USD, AI_MONTHLY_CAP_PRO_USD,
// AI_MONTHLY_CAP_ENABLED). If the web values are not the defaults below, set the same values as Supabase function
// secrets, or the two sides will disagree about where the ceiling is.
//
// FAILURE RULE, the same as the web side: when the month's cost cannot be read, a free learner is refused and a Pro
// learner is let through. For the translate path "refused" only means "no AI opinion": the caller falls back to the
// local verdict, so a refusal never blocks a lesson. Switched off (AI_MONTHLY_CAP_ENABLED=false) and "my_ai_cost_month
// is not deployed yet" stay open.
//
// This file imports nothing from the web app so it deploys with the functions.
import type { SupabaseClient } from "@supabase/supabase-js";

export const MICRO = 1_000_000;
export const MONTHLY_CAP_DEFAULTS = { freeUsd: 2, proUsd: 8, warnPercent: 80 } as const;

export type MonthlyCapConfig = {
  enabled: boolean;
  freeMicro: number;
  proMicro: number;
  warnShare: number;
};

const positive = (raw: string | undefined, fallback: number): number => {
  const n = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function monthlyCapConfig(get: (key: string) => string | undefined): MonthlyCapConfig {
  const freeMicro = Math.round(
    positive(get("AI_MONTHLY_CAP_FREE_USD"), MONTHLY_CAP_DEFAULTS.freeUsd) * MICRO,
  );
  const proMicro = Math.max(
    Math.round(positive(get("AI_MONTHLY_CAP_PRO_USD"), MONTHLY_CAP_DEFAULTS.proUsd) * MICRO),
    freeMicro,
  );
  const pct = positive(get("AI_MONTHLY_CAP_WARN_PERCENT"), MONTHLY_CAP_DEFAULTS.warnPercent);
  return {
    enabled: (get("AI_MONTHLY_CAP_ENABLED") ?? "").trim().toLowerCase() !== "false",
    freeMicro,
    proMicro,
    warnShare: pct >= 100 ? MONTHLY_CAP_DEFAULTS.warnPercent / 100 : pct / 100,
  };
}

export type MonthlyCapDeps = {
  /** True when this learner has Pro (heartsUnlimitedFor in production). Must not throw; false when unsure. */
  isPro: (userId: string) => Promise<boolean>;
  /** Environment reader; defaults to Deno.env. */
  env?: (key: string) => string | undefined;
};

type MonthRow = { uid?: unknown; month_micro?: unknown };

function readRow(data: unknown): { uid: string; micro: number } | null {
  const row = (Array.isArray(data) ? data[0] : data) as MonthRow | null | undefined;
  if (!row || typeof row.uid !== "string") return null;
  const micro = typeof row.month_micro === "string" ? Number(row.month_micro) : row.month_micro;
  if (typeof micro !== "number" || !Number.isFinite(micro) || micro < 0) return null;
  return { uid: row.uid, micro };
}

export const denoEnv = (key: string): string | undefined => {
  try {
    return (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get(
      key,
    );
  } catch {
    return undefined;
  }
};

/**
 * True when this learner may spend one more costly AI call this month. userClient carries the learner's own JWT
 * (my_ai_cost_month reads auth.uid()). Never throws.
 */
export async function monthlyCapAllows(
  userClient: SupabaseClient,
  deps: MonthlyCapDeps,
): Promise<boolean> {
  let readFailed = false;
  try {
    const cfg = monthlyCapConfig(deps.env ?? denoEnv);
    if (!cfg.enabled) return true;
    const { data, error } = await userClient.rpc("my_ai_cost_month");
    if (error) {
      const code = (error as { code?: string }).code;
      const message = String((error as { message?: string }).message ?? "");
      const missing =
        code === "42883" || code === "PGRST202" || /schema cache|does not exist/i.test(message);
      if (missing) {
        console.error(
          "[ai-cap] my_ai_cost_month is not deployed yet; the monthly cap is not enforced",
        );
        return true;
      }
      console.error("[ai-cap] could not read the month's cost:", message);
      readFailed = true;
    } else {
      const row = readRow(data);
      if (!row) {
        console.error("[ai-cap] unexpected month cost answer");
        readFailed = true;
      } else {
        // The tier only matters once the spend is near the free ceiling (no entitlement lookup before that).
        if (row.micro < cfg.freeMicro * cfg.warnShare) return true;
        const pro = await deps.isPro(row.uid).catch(() => false);
        return row.micro < (pro ? cfg.proMicro : cfg.freeMicro);
      }
    }
  } catch (e) {
    console.error("[ai-cap] check failed:", e instanceof Error ? e.message : "error");
    readFailed = true;
  }
  if (!readFailed) return true;
  // The failure rule: free fails closed, Pro stays open. The id comes from the session, as the read failed.
  try {
    const { data } = await userClient.auth.getUser();
    const uid = data?.user?.id;
    if (!uid) return false;
    return await deps.isPro(uid).catch(() => false);
  } catch {
    return false;
  }
}
