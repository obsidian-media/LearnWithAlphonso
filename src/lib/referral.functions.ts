import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  claimReason,
  summarizeReferrals,
  type ClaimResult,
  type ReferralRow,
  type ReferralSummary,
} from "./referral";

/** The generated types do not know the referral table or functions until they are regenerated after the deploy. */
type Untyped = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: (t: string) => {
    select: (c: string) => {
      eq: (c: string, v: string) => Promise<{ data: unknown; error: unknown }>;
    };
  };
};

/**
 * Claims the code a new account arrived with. Everything is decided by claim_referral (SECURITY DEFINER): the caller is
 * the database's auth.uid(), never an argument, and self-referral, a second referral and a retroactive claim are all
 * refused there. Creating the row grants nothing; the reward waits for the friend's first lesson.
 */
export const claimReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().min(1).max(64) }).parse(d))
  .handler(async ({ data, context }): Promise<ClaimResult> => {
    const db = context.supabase as unknown as Untyped;
    const { data: rows, error } = await db.rpc("claim_referral", { _code: data.code });
    const row = (Array.isArray(rows) ? rows[0] : null) as { ok?: boolean; reason?: string } | null;
    if (error || !row) return { ok: false, reason: "error" };
    return row.ok ? { ok: true } : { ok: false, reason: claimReason(row.reason) };
  });

/** The learner's own code (shared with the friend invite) and their referral counts, from their own rows (RLS). */
export const getReferralOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }): Promise<{ code: string | null; summary: ReferralSummary | null }> => {
      const db = context.supabase as unknown as Untyped;
      const [codeRes, rowsRes] = await Promise.all([
        db.rpc("get_or_create_my_friend_code"),
        db.from("referrals").select("status,capped,completed_at").eq("referrer_id", context.userId),
      ]);
      const code =
        (Array.isArray(codeRes.data)
          ? (codeRes.data[0] as { code?: string } | undefined)?.code
          : null) ?? null;
      // A failed read says "unknown" (null), never a made-up zero.
      const summary = rowsRes.error
        ? null
        : summarizeReferrals((rowsRes.data ?? []) as ReferralRow[]);
      return { code, summary };
    },
  );
