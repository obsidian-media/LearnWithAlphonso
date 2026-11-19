import { createHash } from "node:crypto";
import type { ServerHeartsMode } from "./hearts-gate.server";
import type { ProEntitlementStatus, RevenueCatConfig } from "./revenuecat-entitlement";
import { recordOpsEvent } from "./ops-events.server";

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

/**
 * Whether this learner has unlimited hearts right now, or null when that could not be established (RevenueCat could
 * not be asked and no fresh cached answer exists). A caller that WRITES from the answer (a hearts charge, a referral
 * reward) treats null as "retry later", never as "not Pro". Never throws.
 */
export async function heartsUnlimitedOrUnknown(
  userId: string,
  deps: HeartsServerDeps,
): Promise<boolean | null> {
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
    if (status === "unavailable") return null;
    const pro = status === "active";
    await db
      .from("hearts_pro_status")
      .upsert(
        { user_id: userId, pro, checked_at: new Date(now).toISOString() },
        { onConflict: "user_id" },
      );
    return pro;
  } catch {
    return null;
  }
}

/**
 * Pro for a decision that must still be made when RevenueCat cannot be asked (a lesson already saved, the start gate):
 * the live or fresh answer; else the last stored answer at ANY age ("stale"); else "unknown". Never throws. A caller
 * treats "unknown" as not Pro WITHOUT charging (a shadow settlement), and never as Pro (that refills hearts).
 */
export async function heartsProWithFallback(
  userId: string,
  deps: HeartsServerDeps,
): Promise<{ pro: boolean; source: "live" | "stale" | "unknown" }> {
  const live = await heartsUnlimitedOrUnknown(userId, deps);
  if (live !== null) return { pro: live, source: "live" };
  try {
    const db = await deps.db();
    const { data } = await db
      .from("hearts_pro_status")
      .select("pro")
      .eq("user_id", userId)
      .maybeSingle();
    const pro = (data as { pro?: unknown } | null)?.pro;
    if (typeof pro === "boolean") return { pro, source: "stale" };
  } catch {
    // no cache readable: unknown
  }
  return { pro: false, source: "unknown" };
}

/** Whether this learner has unlimited hearts right now. Never throws; fails closed (false). Read-only uses only. */
export async function heartsUnlimited(userId: string, deps: HeartsServerDeps): Promise<boolean> {
  return (await heartsUnlimitedOrUnknown(userId, deps)) === true;
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
  const r = await settleLessonHeartsStrict(args, deps);
  return r.ok ? r.settlement : null;
}

/**
 * Like settleLessonHearts, but says whether the settlement could not run (the database call failed): ok:false means
 * the caller must not report a finished settlement; the retry is answered from the stored completion and settles with
 * the ORIGINAL misses. Pro unknown (RevenueCat down) never fails a saved lesson: a stored "not Pro" is used at any
 * age; a stored "Pro" that is no longer fresh, or none at all, makes it a shadow settlement (_enforce=false,
 * _pro=false: charges nothing, records the token). It is never settled as Pro from an unconfirmed answer, which would
 * refill a lapsed subscriber's hearts.
 */
export async function settleLessonHeartsStrict(
  args: {
    userId: string;
    sessionToken: string;
    misses: number;
    sinceMs: number;
    mode: ServerHeartsMode;
  },
  deps: HeartsServerDeps,
): Promise<{ ok: true; settlement: HeartsSettlement | null } | { ok: false }> {
  if (args.mode === "off") return { ok: true, settlement: null };
  try {
    const proAnswer = await heartsProWithFallback(args.userId, deps);
    let pro = proAnswer.pro;
    let enforce = args.mode === "on";
    if (proAnswer.source === "stale" && pro) {
      pro = false;
      enforce = false;
      console.error(
        JSON.stringify({ event: "hearts_settlement_shadow_stale_pro", fn: "completeLessonRemote" }),
      );
      await recordOpsEvent(
        "hearts_settlement_shadow_stale_pro",
        { fn: "completeLessonRemote" },
        args.userId,
      );
    } else if (proAnswer.source === "stale") {
      console.error(
        JSON.stringify({ event: "hearts_settlement_stale_pro", fn: "completeLessonRemote" }),
      );
    } else if (proAnswer.source === "unknown") {
      enforce = false;
      console.error(
        JSON.stringify({
          event: "hearts_settlement_shadow_pro_unknown",
          fn: "completeLessonRemote",
        }),
      );
      await recordOpsEvent(
        "hearts_settlement_shadow_pro_unknown",
        { fn: "completeLessonRemote" },
        args.userId,
      );
    }
    const db = await deps.db();
    const { data, error } = await db.rpc("settle_lesson_hearts", {
      _user_id: args.userId,
      _token_hash: createHash("sha256").update(args.sessionToken).digest("hex"),
      _misses: args.misses,
      _since: new Date(args.sinceMs).toISOString(),
      _enforce: enforce,
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
      await recordOpsEvent("hearts_settlement_failed", { fn: "completeLessonRemote" }, args.userId);
      return { ok: false };
    }
    return {
      ok: true,
      settlement: {
        hearts: row.hearts,
        heartsRefillAt:
          typeof row.hearts_refill_at === "string" ? Date.parse(row.hearts_refill_at) : null,
      },
    };
  } catch {
    console.error(
      JSON.stringify({ event: "hearts_settlement_failed", fn: "completeLessonRemote" }),
    );
    await recordOpsEvent("hearts_settlement_failed", { fn: "completeLessonRemote" }, args.userId);
    return { ok: false };
  }
}
