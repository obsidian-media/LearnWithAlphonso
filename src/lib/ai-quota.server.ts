import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type QuotaKind = "chat" | "stt" | "tts";

/**
 * Per-user daily caps on AI usage, for display only — the real cap is
 * enforced inside `consume_ai_quota` in the database (see migration
 * 20260910000000). Keep these in sync with that function.
 */
export const DAILY_LIMITS: Record<QuotaKind, number> = {
  chat: 60,
  stt: 60,
  tts: 80,
};

export type QuotaResult =
  | { ok: true; used: number; limit: number }
  | { ok: false; status: number; message: string };

function bearer(request: Request): string | null {
  const h = request.headers.get("Authorization") ?? request.headers.get("authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1] : null;
}

/**
 * Verifies the caller's Supabase session and atomically consumes one unit of
 * their daily quota for `kind`. Returns a failure result when unauthenticated
 * or over the cap.
 */
export async function consumeQuota(request: Request, kind: QuotaKind): Promise<QuotaResult> {
  const token = bearer(request);
  if (!token) return { ok: false, status: 401, message: "Sign in to use AI features." };

  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
  if (!url || !key) return { ok: false, status: 500, message: "Server not configured." };

  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("apikey", key);
        headers.set("Authorization", `Bearer ${token}`);
        return fetch(input, { ...init, headers });
      },
    },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return { ok: false, status: 401, message: "Session expired — sign in again." };
  }

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
