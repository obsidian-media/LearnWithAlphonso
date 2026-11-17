// The Edge Function half of the referral reward (rules: supabase/migrations/20261120140000_referral_program.sql; the web
// half is src/lib/referral.server.ts, keep the two in step). Called after a lesson completion is SAVED. Never throws,
// and does nothing at all unless this learner has a still-pending referral. Pro is decided here (RevenueCat, through
// heartsUnlimitedFor) and passed to the service-role-only database function, never taken from a client.
import type { SupabaseClient } from "@supabase/supabase-js";

export type ReferralOutcome = "none" | "granted" | "capped" | "not-yet" | "error";

export async function settleReferralReward(
  admin: SupabaseClient,
  userId: string,
  isPro: (admin: SupabaseClient, userId: string) => Promise<boolean>,
): Promise<ReferralOutcome> {
  try {
    const { data: pending, error } = await admin
      .from("referrals")
      .select("referrer_id")
      .eq("referee_id", userId)
      .eq("status", "pending")
      .maybeSingle();
    if (error) return "error";
    const referrerId = (pending as { referrer_id?: unknown } | null)?.referrer_id;
    if (typeof referrerId !== "string") return "none";
    const referrerPro = await isPro(admin, referrerId);
    const { data, error: rpcError } = await admin.rpc("grant_referral_reward", {
      _referee: userId,
      _referrer_pro: referrerPro,
    });
    if (rpcError) return "error";
    const status = (data as { status?: unknown } | null)?.status;
    if (status === "granted" || status === "capped" || status === "not-yet") return status;
    return "none";
  } catch {
    return "error";
  }
}
