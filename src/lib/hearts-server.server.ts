import { createHash } from "node:crypto";
import type { ServerHeartsMode } from "./hearts-gate.server";
import type { ProEntitlementStatus, RevenueCatConfig } from "./revenuecat-entitlement";

/**
 * The web's half of "hearts are settled on the server" (the Edge Functions have the Deno half:
 * supabase/functions/_shared/hearts-pro.ts and complete-lesson/handler.ts). Keep the two in step.
 *
 * - heartsUnlimited: Alphonso Pro has unlimited hearts. The answer is cached in hearts_pro_status (an hour for Pro,
 *   ten minutes for not Pro) so lose_heart(), which cannot call RevenueCat, honours it during the lesson.
 * - settleLessonHearts: settle_lesson_hearts for one lesson session, after the completion is saved.
 */

/** A confirmed Pro answer is trusted for an hour (the same window lose_heart() honours). */
export const PRO_FRESH_MS = 60 * 60 * 1000;
/** A confirmed non-Pro answer is re-checked after ten minutes. */
export const NOT_PRO_FRESH_MS = 10 * 60 * 1000;

type Untyped = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (
        c: string,
        v: string,
      ) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> };
    };
    upsert: (
      row: Record<string, unknown>,
      o: { onConflict: string },
    ) => Promise<{ error: unknown }>;
  };
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export type HeartsServerDeps = {
  /** The service-role client. The new tables and function are not in the generated types until they are regenerated. */
  db: () => Promise<Untyped>;
  rcConfig: () => RevenueCatConfig | null;
  proStatus: (config: RevenueCatConfig, userId: string) => Promise<ProEntitlementStatus>;
  now: () => number;
};

export async function liveHeartsServerDeps(): Promise<HeartsServerDeps> {
  const { revenueCatConfigFromEnv, getProEntitlementStatus } =
    await import("./revenuecat-entitlement");
  return {
    db: async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      return supabaseAdmin as unknown as Untyped;
    },
    rcConfig: () => revenueCatConfigFromEnv(),
    proStatus: (config, userId) => getProEntitlementStatus(config, userId),
    now: () => Date.now(),
  };
}

/** Whether this learner has unlimited hearts right now. Never throws; fails closed (false). */
export async function heartsUnlimited(userId: string, deps: HeartsServerDeps): Promise<boolean> {
  try {
    const db = await deps.db();
    const now = deps.now();
    const { data } = await db
      .from("hearts_pro_status")
      .select("pro, checked_at")
      .eq("user_id", userId)
      .maybeSingle();
    const cached = data as { pro?: unknown; checked_at?: unknown } | null;
    if (cached && typeof cached.checked_at === "string") {
      const age = now - new Date(cached.checked_at).getTime();
      if (age >= 0 && age < (cached.pro ? PRO_FRESH_MS : NOT_PRO_FRESH_MS))
        return cached.pro === true;
    }
    const config = deps.rcConfig();
    if (!config) return false;
    const status = await deps.proStatus(config, userId);
    if (status === "unavailable") return false;
    const pro = status === "active";
    await db
      .from("hearts_pro_status")
      .upsert(
        { user_id: userId, pro, checked_at: new Date(now).toISOString() },
        { onConflict: "user_id" },
      );
    return pro;
  } catch {
    return false;
  }
}

export type HeartsSettlement = { hearts: number; heartsRefillAt: number | null };

/**
 * Settles one lesson session's hearts from the server's own grading. Misses the app already reported through
 * lose_heart are not charged again; the rest are charged only in mode "on". Returns null (the completion's own hearts
 * stand) when the mode is "off" or anything fails: it never fails a saved lesson.
 */
export async function settleLessonHearts(
  args: {
    userId: string;
    sessionToken: string;
    misses: number;
    sinceMs: number;
    mode: ServerHeartsMode;
  },
  deps: HeartsServerDeps,
): Promise<HeartsSettlement | null> {
  if (args.mode === "off") return null;
  try {
    const pro = await heartsUnlimited(args.userId, deps);
    const db = await deps.db();
    const { data, error } = await db.rpc("settle_lesson_hearts", {
      _user_id: args.userId,
      _token_hash: createHash("sha256").update(args.sessionToken).digest("hex"),
      _misses: args.misses,
      _since: new Date(args.sinceMs).toISOString(),
      _enforce: args.mode === "on",
      _pro: pro,
    });
    const row = (Array.isArray(data) ? data[0] : data) as {
      hearts?: unknown;
      hearts_refill_at?: unknown;
    } | null;
    if (error || !row || typeof row.hearts !== "number") {
      console.error(
        JSON.stringify({ event: "hearts_settlement_failed", fn: "completeLessonRemote" }),
      );
      return null;
    }
    return {
      hearts: row.hearts,
      heartsRefillAt:
        typeof row.hearts_refill_at === "string" ? Date.parse(row.hearts_refill_at) : null,
    };
  } catch {
    console.error(
      JSON.stringify({ event: "hearts_settlement_failed", fn: "completeLessonRemote" }),
    );
    return null;
  }
}
