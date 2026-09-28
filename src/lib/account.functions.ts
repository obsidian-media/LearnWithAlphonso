import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

// Every table with a `user_id` column, exported via `.eq("user_id", ...)`.
// NOTE: "achievements" is the static catalogue (no user_id column at all --
// the user-owned table is "user_achievements", a bug this list previously
// had); "profiles" is handled separately below since its PK is `id`, not
// `user_id`. Keep this in sync with new user-scoped tables -- this list has
// silently drifted three times (language_progress/ai_rate_limits, then the
// whole gamification + push batch), each time producing incomplete GDPR
// exports with nothing failing. `account.functions.test.ts` now reads the
// migrations and fails the build instead of relying on remembering.
export const USER_ID_EXPORT_TABLES = [
  "activity_days",
  "ai_rate_limits",
  "ai_usage",
  "challenge_completions",
  "device_tokens",
  "duel_queue",
  "friend_activity_events",
  "friendships",
  "language_progress",
  "lesson_completions",
  "podcast_play_events",
  "podcast_playback",
  "review_items",
  "season_cohort_members",
  "season_placements",
  "team_members",
  "user_achievements",
  "user_progress",
  "user_weekly_quest_claims",
  "weakness_events",
] as const;

// User-owned rows that are NOT keyed by `user_id`, so the scan above can't
// reach them -- both sides of a nudge and both sides of a duel are the
// account's own data for portability purposes.
export const OTHER_OWNED_EXPORT_TABLES = [
  { table: "nudges", columns: ["sender_id", "recipient_id"] },
  { table: "duels", columns: ["challenger_id", "opponent_id"] },
] as const;

// deleteMyAccount issues its DELETEs *as the caller*, so this is deliberately
// only the tables `authenticated` actually holds a DELETE grant on -- the
// gamification tables revoked direct writes
// (20260920050000_revoke_direct_gamification_writes.sql) and would just fail
// silently. Everything else is cleaned up by ON DELETE CASCADE from
// auth.users when deleteUser() runs below, so nothing is left behind.
export const USER_DELETE_TABLES = [
  "review_items",
  "lesson_completions",
  "activity_days",
  "user_achievements",
  "friendships",
  "ai_usage",
  "ai_rate_limits",
  "user_progress",
  "language_progress",
] as const;

// user_progress carries account-wide state (streak/hearts) plus five
// columns frozen since the 2026-09-08 multi-course migration -- xp,
// cefr_level, league_tier and both placement_* trios all moved to
// language_progress (per course), and nothing writes the user_progress
// copies anymore (mergeGuestProgress is the one exception, and it's dead
// code with no caller anywhere in the app -- see docs/BACKLOG.md).
// Exporting them via select("*") showed a GDPR download two disagreeing
// values for the same concept (e.g. xp) with no way to tell which was
// real -- §2.2's "related, smaller finding not fixed".
const USER_PROGRESS_EXPORT_COLUMNS =
  "user_id,streak,longest_streak,last_active_date,last_review_bonus_date,hearts,hearts_refill_at,streak_freezes,updated_at";

/** Export every row this account owns (GDPR data portability). */
export const exportMyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;
    // Independent selects -- batched instead of a sequential loop, so a GDPR
    // export stays one round trip's worth of latency rather than one per
    // table as this list grows.
    const [userIdRows, otherOwnedRows, { data: profile }] = await Promise.all([
      Promise.all(
        USER_ID_EXPORT_TABLES.map((table) =>
          supabase
            .from(table)
            .select(table === "user_progress" ? USER_PROGRESS_EXPORT_COLUMNS : "*")
            .eq("user_id", userId),
        ),
      ),
      Promise.all(
        OTHER_OWNED_EXPORT_TABLES.map(({ table, columns }) =>
          supabase
            .from(table)
            .select("*")
            .or(columns.map((c) => `${c}.eq.${userId}`).join(",")),
        ),
      ),
      supabase.from("profiles").select("*").eq("id", userId),
    ]);
    const tables: Record<string, unknown[]> = {};
    USER_ID_EXPORT_TABLES.forEach((table, i) => {
      tables[table] = (userIdRows[i].data as unknown[]) ?? [];
    });
    OTHER_OWNED_EXPORT_TABLES.forEach(({ table }, i) => {
      tables[table] = (otherOwnedRows[i].data as unknown[]) ?? [];
    });
    tables.profiles = profile ?? [];
    return {
      exported_at: new Date().toISOString(),
      user_id: userId,
      // The account's own email lives on auth.users, not any table this
      // handler is scoped to query as the caller -- profiles has no email
      // column (confirmed against the live schema). It's already right
      // here in the verified JWT claims from requireSupabaseAuth, so no
      // extra round trip is needed. Without this, a GDPR "download my
      // data" export silently omitted the one field the privacy policy's
      // own "What we collect" section lists first.
      email: (claims as { email?: string }).email ?? null,
      tables: JSON.stringify(tables),
    };
  });

/** Permanently delete the account and all associated data (GDPR erasure). */
/**
 * "revoked": Apple confirmed the grant is gone.
 * "not_applicable": nothing to revoke -- no Apple secrets configured, or
 * this user never linked Sign in with Apple. Expected and common; not
 * worth logging.
 * "failed": there WAS a stored grant and Apple's revoke call did not
 * succeed. This is the one outcome worth chasing -- see the call sites.
 */
export type AppleRevocationStatus = "revoked" | "not_applicable" | "failed";

/**
 * Revokes the user's Apple grant if there is one, reporting what
 * happened. Never throws -- see the call site in deleteMyAccount.
 *
 * Was a bare boolean that collapsed "nothing to revoke" and "revocation
 * genuinely failed" into the same `false`, and neither call site (here
 * nor adminDeleteReportedUser) read the result at all -- found in a
 * 2026-09-28 audit to be silent end-to-end: a real revocation failure
 * produced no log, no alert, nothing. Both call sites now log the
 * "failed" case specifically, which is the one that needs a human to
 * notice and re-run revocation by hand.
 *
 * Exported so admin.functions.ts's adminDeleteReportedUser can reuse the
 * exact same revoke-then-delete step for an admin-initiated deletion --
 * Apple's requirement to revoke on account deletion applies regardless of
 * who deletes the account, and this is the only place that talks to
 * apple_auth_tokens + the revoke API.
 */
export async function revokeAppleGrantForUser(
  supabaseAdmin: SupabaseClient<Database>,
  userId: string,
): Promise<AppleRevocationStatus> {
  try {
    const { appleConfigFromEnv, revokeAppleGrant } = await import("@/lib/apple-revocation");
    const config = appleConfigFromEnv();
    if (!config) return "not_applicable";

    const { data } = await supabaseAdmin
      .from("apple_auth_tokens")
      .select("refresh_token")
      .eq("user_id", userId)
      .maybeSingle();
    const refreshToken = data?.refresh_token;
    if (!refreshToken) return "not_applicable";

    const revoked = await revokeAppleGrant(config, refreshToken);
    return revoked ? "revoked" : "failed";
  } catch {
    return "failed";
  }
}

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ confirm: z.literal("DELETE") }).parse(d))
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Remove owned rows first, as the caller, so RLS stays the source of
    // truth. "profiles" is deliberately not deleted here -- its FK to
    // auth.users is ON DELETE CASCADE, and "authenticated" only has
    // SELECT/INSERT/UPDATE grants on it (no DELETE), so a client-side
    // delete would just fail; the deleteUser() call below cleans it up.
    await Promise.all(
      USER_DELETE_TABLES.map((table) => supabase.from(table).delete().eq("user_id", userId)),
    );

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Apple requires an app offering Sign in with Apple to revoke the
    // user's grant when they delete their account. Done BEFORE deleteUser,
    // because the row is FK'd to auth.users ON DELETE CASCADE and would be
    // gone afterwards.
    //
    // Deliberately never throws. A user's right to delete their account
    // cannot depend on Apple being reachable, or on these secrets being
    // configured -- so the outcome is reported, and deletion proceeds
    // either way. "failed" means a grant is still live and is a
    // compliance problem to chase; refusing the deletion would be a
    // worse one.
    const appleRevocationStatus = await revokeAppleGrantForUser(supabaseAdmin, userId);
    // Was computed and returned to the caller but never actually looked
    // at anywhere -- neither this server log nor the iOS client read it
    // (found in a 2026-09-28 audit). This is the one line that makes a
    // real failure visible at all right now; a proper alert/retry queue
    // is future work if this ever fires in practice.
    if (appleRevocationStatus === "failed") {
      console.error(
        `[apple-revocation] FAILED to revoke Apple grant for user ${userId} during account deletion -- a live grant may still exist.`,
      );
    }

    // Friend rows pointing at this user are not owned by them.
    await supabaseAdmin.from("friendships").delete().eq("friend_id", userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);

    return { deleted: true, appleRevocationStatus };
  });
