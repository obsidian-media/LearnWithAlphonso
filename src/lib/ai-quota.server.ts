import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createSupabaseFetch } from "@/integrations/supabase/fetch";

export type QuotaKind = "chat" | "stt" | "tts" | "translate" | "define";

/**
 * Per-user daily caps on AI usage, for display only — the real cap is
 * enforced inside `consume_ai_quota` in the database (see migration
 * 20260910000000, raised for `stt` by 20260930050000_raise_stt_daily_limit.sql).
 * Keep these in sync with that function.
 */
export const DAILY_LIMITS: Record<QuotaKind, number> = {
  chat: 60,
  // Temporarily raised from 60 -- active debugging of the still-unsolved
  // "Empty or missing audio" bug needs many real retries in a row. See
  // the migration's own comment for the revert note.
  stt: 300,
  tts: 80,
  // Its own budget rather than a share of `chat`'s: translation grading is
  // only reached by submissions the curated answer list already rejected, so
  // a learner writing unusual-but-valid English should not quietly eat the
  // conversation practice they also paid for.
  translate: 60,
  // Saving a word makes one small NVIDIA call (see /api/define-word). Its own
  // budget so saving words never eats the conversation turns a learner pays
  // for, and so a runaway tap loop has a known cost ceiling.
  define: 40,
};

export type QuotaResult =
  { ok: true; used: number; limit: number } | { ok: false; status: number; message: string };

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
 * list or NVIDIA_API_KEY was unset, since those paths never reached
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
export async function consumeQuota(request: Request, kind: QuotaKind): Promise<QuotaResult> {
  const auth = await verifyAuth(request);
  if (!auth.ok) return auth;
  return consumeQuotaFor(auth.supabase, kind);
}

/** The rate-limit and daily-cap half of consumeQuota, for a caller that has already verified the session. */
export async function consumeQuotaFor(
  supabase: ReturnType<typeof createClient<Database>>,
  kind: QuotaKind,
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
    };
  }
  return { ok: true, used: row.used ?? 0, limit };
}
