/**
 * The server half of the referral reward (rules: 20261120140000_referral_program.sql; the Edge Function half is
 * supabase/functions/_shared/referral.ts, keep the two in step). Called after a lesson completion is SAVED (and its
 * hearts settled). The learner's own lesson must never fail or wait on this, so it never throws and does nothing at all
 * unless this learner has a still-pending referral.
 *
 * Pro is decided here, by the server (RevenueCat), and passed in: the database function is service-role only, so a
 * client can never claim "my referrer is Pro" or trigger a grant.
 */
type Untyped = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (
        c: string,
        v: string,
      ) => {
        eq: (
          c: string,
          v: string,
        ) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> };
      };
    };
  };
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export type ReferralDeps = {
  db: () => Promise<Untyped>;
  /** Whether the learner has Pro (unlimited hearts). null = not established: nothing is granted this time. */
  isPro: (userId: string) => Promise<boolean | null>;
};

export async function liveReferralDeps(): Promise<ReferralDeps> {
  const { heartsUnlimitedOrUnknown, liveHeartsServerDeps } = await import("./hearts-server.server");
  const heartsDeps = await liveHeartsServerDeps();
  return {
    db: () => heartsDeps.db() as unknown as Promise<Untyped>,
    isPro: (userId) => heartsUnlimitedOrUnknown(userId, heartsDeps),
  };
}

export type ReferralOutcome = "none" | "granted" | "capped" | "not-yet" | "error";

export async function settleReferralReward(
  userId: string,
  deps: ReferralDeps,
): Promise<ReferralOutcome> {
  try {
    const db = await deps.db();
    const { data: pending, error } = await db
      .from("referrals")
      .select("referrer_id")
      .eq("referee_id", userId)
      .eq("status", "pending")
      .maybeSingle();
    if (error) return "error";
    const referrerId = (pending as { referrer_id?: unknown } | null)?.referrer_id;
    if (typeof referrerId !== "string") return "none";
    const referrerPro = await deps.isPro(referrerId);
    // The reward depends on the referrer's Pro status; "unknown" must not be written as "not Pro".
    if (referrerPro === null) return "error";
    const { data, error: rpcError } = await db.rpc("grant_referral_reward", {
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
