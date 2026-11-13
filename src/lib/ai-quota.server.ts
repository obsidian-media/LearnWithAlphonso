import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createSupabaseFetch } from "@/integrations/supabase/fetch";
import { nextMinute, nextUtcMidnight } from "./ai-quota-response";
import { HECTOR_DAILY_LIMIT } from "./hector-allowance";
import { EXPLAIN_DAILY_LIMIT } from "./explain";

export type QuotaKind = "chat" | "stt" | "tts" | "translate" | "define" | "hector" | "explain";

/**
 * Per-user daily caps on AI usage, for display only — the real cap is
 * enforced inside `consume_ai_quota` in the database (see migration
 * 20260910000000, raised for `stt` by 20260930050000_raise_stt_daily_limit.sql).
 * Keep these in sync with that function.
 */
export const DAILY_LIMITS: Record<QuotaKind, number> = {
  chat: 60,
  // 300 was a temporary debugging allowance; the owner set 120 on 2026-11-04
  // (20261104100000_stt_daily_limit_120.sql).
  stt: 120,
  tts: 80,
  // Its own budget rather than a share of `chat`'s: translation grading is
  // only reached by submissions the curated answer list already rejected, so
  // a learner writing unusual-but-valid English should not quietly eat the
  // conversation practice they also paid for.
  translate: 60,
  // Saving a word makes one small AI call (see /api/define-word). Its own
  // budget so saving words never eats the conversation turns a learner pays
  // for, and so a runaway tap loop has a known cost ceiling.
  define: 40,
  // Pro learners' Hector turns (20261102120000). Separate from `chat`, which free Practice spends, so practicing
  // never blocks the feature a learner pays for; still capped to bound AI cost.
  hector: HECTOR_DAILY_LIMIT,
  // "Explain in my language": one short call per tap (/api/explain), its own budget; a cache hit spends none.
  // Hector explanations spend `hector` instead. 20261112100000_explain_in_my_language.sql.
  explain: EXPLAIN_DAILY_LIMIT,
};

export type QuotaResult =
  | { ok: true; used: number; limit: number }
  | { ok: false; status: number; message: string; code?: "quota-exceeded"; resetsAt?: string };

export type AuthResult =
  | { ok: true; supabase: ReturnType<typeof createClient<Database>>; userId: string }
  | { ok: false; status: number; message: string };

function bearer(request: Request): string | null {
  const h = request.headers.get("Authorization") ?? request.headers.get("authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1] : null;
}

/**
 * Verifies the caller's Supabase session with no quota consumed -- the auth
 * half of consumeQuota, extracted so a route that must reject an
 * unauthenticated caller before its own free/local-only paths (which spend
 * no quota by design) can do so without also burning a quota unit on every
 * request. See grade-translation.ts, found missing entirely in a
 * 2026-09-29 codebase audit: it returned real verdicts to callers with no
 * Authorization header at all whenever a submission matched the curated
 * list or OPENROUTER_API_KEY was unset, since those paths never reached
 * consumeQuota.
 */
export async function verifyAuth(request: Request): Promise<AuthResult> {
  const token = bearer(request);
  if (!token) return { ok: false, status: 401, message: "Sign in to use AI features." };

  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
  if (!url || !key) return { ok: false, status: 500, message: "Server not configured." };

  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: createSupabaseFetch(key),
    },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return { ok: false, status: 401, message: "Session expired — sign in again." };
  }
  return { ok: true, supabase, userId: userData.user.id };
}

/**
 * Verifies the caller's Supabase session and atomically consumes one unit of
 * their daily quota for `kind`. Returns a failure result when unauthenticated
 * or over the cap.
 */
export async function consumeQuota(
  request: Request,
  kind: QuotaKind,
  now: Date = new Date(),
): Promise<QuotaResult> {
  const auth = await verifyAuth(request);
  if (!auth.ok) return auth;
  return consumeQuotaFor(auth.supabase, kind, now);
}

/** The rate-limit and daily-cap half of consumeQuota, for a caller that has already verified the session. */
export async function consumeQuotaFor(
  supabase: ReturnType<typeof createClient<Database>>,
  kind: QuotaKind,
  now: Date = new Date(),
): Promise<QuotaResult> {
  // Per-minute burst limit, on top of the daily cap below — checked first
  // so a rejected burst doesn't also eat into the day's quota.
  const { data: rlData, error: rlError } = await supabase.rpc("consume_ai_rate_limit", {
    _kind: kind,
  });
  if (rlError) return { ok: false, status: 500, message: "Could not verify your usage." };
  const rlRow = Array.isArray(rlData) ? rlData[0] : rlData;
  if (!rlRow || !rlRow.allowed) {
    return {
      ok: false,
      status: 429,
      message: "Too many requests — slow down and try again in a minute.",
      code: "quota-exceeded",
      resetsAt: nextMinute(now),
    };
  }

  const limit = DAILY_LIMITS[kind];
  const { data, error } = await supabase.rpc("consume_ai_quota", {
    _kind: kind,
  });
  if (error) return { ok: false, status: 500, message: "Could not verify your usage." };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.allowed) {
    return {
      ok: false,
      status: 429,
      message: `Daily ${kind.toUpperCase()} limit reached (${limit}/day). Try again tomorrow.`,
      code: "quota-exceeded",
      resetsAt: nextUtcMidnight(now),
    };
  }
  return { ok: true, used: row.used ?? 0, limit };
}
