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

/** Export every row this account owns (GDPR data portability). */
export const exportMyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Independent selects -- batched instead of a sequential loop, so a GDPR
    // export stays one round trip's worth of latency rather than one per
    // table as this list grows.
    const [userIdRows, otherOwnedRows, { data: profile }] = await Promise.all([
      Promise.all(
        USER_ID_EXPORT_TABLES.map((table) =>
          supabase.from(table).select("*").eq("user_id", userId),
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
      tables: JSON.stringify(tables),
    };
  });

/** Permanently delete the account and all associated data (GDPR erasure). */
/**
 * Revokes the user's Apple grant if there is one, reporting whether it
 * happened. Never throws -- see the call site in deleteMyAccount.
 *
 * Returns false for every "we could not", which are deliberately not
 * distinguished to the caller: no Apple secrets configured, no stored
 * token (the user never used Apple sign-in), or Apple refused. Only a
 * confirmed revocation returns true, because the one thing worth
 * asserting is that the grant is definitely gone.
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
): Promise<boolean> {
  try {
    const { appleConfigFromEnv, revokeAppleGrant } = await import("@/lib/apple-revocation");
    const config = appleConfigFromEnv();
    if (!config) return false;

    const { data } = await supabaseAdmin
      .from("apple_auth_tokens")
      .select("refresh_token")
      .eq("user_id", userId)
      .maybeSingle();
    const refreshToken = data?.refresh_token;
    if (!refreshToken) return false;

    return await revokeAppleGrant(config, refreshToken);
  } catch {
    return false;
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
    // either way. `appleRevoked: false` means a grant is still live and is
    // a compliance problem to chase; refusing the deletion would be a worse
    // one.
    const appleRevoked = await revokeAppleGrantForUser(supabaseAdmin, userId);

    // Friend rows pointing at this user are not owned by them.
    await supabaseAdmin.from("friendships").delete().eq("friend_id", userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);

    return { deleted: true, appleRevoked };
  });
