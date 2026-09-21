import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type FriendEntry = {
  userId: string;
  displayName: string;
  avatarSeed: string;
  streak: number;
  weekXp: number;
};

/** Friends' account-wide streak + this-week XP, for the Friends tab. */
export const getFriends = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FriendEntry[]> => {
    const { data } = await context.supabase.rpc("get_friends_progress");
    return (data ?? []).map((r) => ({
      userId: r.user_id,
      displayName: r.display_name ?? "Learner",
      avatarSeed: r.avatar_seed ?? "0",
      streak: r.streak ?? 0,
      weekXp: r.week_xp ?? 0,
    }));
  });

/**
 * Accepts a friend invite. Opening the inviter's link and confirming *is*
 * the consent action — writes both friendship directions atomically via a
 * SECURITY DEFINER RPC, since a client can only otherwise insert rows
 * where it is user_id, not the other direction of the pair.
 */
export const acceptFriendInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ inviterId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    if (data.inviterId === context.userId) {
      return { ok: false, message: "cannot invite yourself" };
    }
    const { data: rows } = await context.supabase.rpc("accept_friend_invite", {
      _inviter_id: data.inviterId,
    });
    const row = rows?.[0];
    return row ?? { ok: false, message: "unknown error" };
  });

/** Display name + avatar for the invite confirmation screen. */
export const getInviterProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ inviterId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("display_name,avatar_seed")
      .eq("id", data.inviterId)
      .maybeSingle();
    return profile ? { displayName: profile.display_name, avatarSeed: profile.avatar_seed } : null;
  });

const courseSchema = z.enum(["en", "fr", "es"]).default("en");

export type DuelStatus = "pending" | "active" | "declined" | "completed";

export type Duel = {
  duelId: string;
  challengerId: string;
  opponentId: string;
  course: string;
  status: DuelStatus;
  challengerXpStart: number;
  opponentXpStart: number;
  challengerXpNow: number;
  opponentXpNow: number;
  winnerId: string | null;
  endsAt: string | null;
};

/**
 * Challenges an accepted friend to a head-to-head XP duel. Validates the
 * friendship, self-challenge, and duplicate-open-duel cases server-side
 * (create_duel RPC, supabase/migrations/20260920060000_v3_engagement_mechanics.sql)
 * -- this handler is a thin pass-through, same pattern as acceptFriendInvite.
 */
export const createDuel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ opponentId: z.string().uuid(), course: courseSchema }).parse(d),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: boolean; reason: string | null; duelId: string | null }> => {
      const { data: rows, error } = await context.supabase.rpc("create_duel", {
        _opponent_id: data.opponentId,
        _course: data.course,
      });
      if (error) return { ok: false, reason: "server-error", duelId: null };
      const row = Array.isArray(rows) ? rows[0] : rows;
      return {
        ok: row?.ok ?? false,
        reason: row?.reason ?? null,
        duelId: row?.duel_id ?? null,
      };
    },
  );

/** Accept or decline a pending duel invitation. */
export const respondToDuel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ duelId: z.string().uuid(), accept: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; reason: string | null }> => {
    const { data: rows, error } = await context.supabase.rpc("respond_to_duel", {
      _duel_id: data.duelId,
      _accept: data.accept,
    });
    if (error) return { ok: false, reason: "server-error" };
    const row = Array.isArray(rows) ? rows[0] : rows;
    return { ok: row?.ok ?? false, reason: row?.reason ?? null };
  });

/**
 * Every duel involving the caller, oldest-first from the RPC. Calling
 * this also lazily resolves any of the caller's active duels whose
 * window has closed (get_my_duels' own side effect) -- no polling/cron
 * needed, see that function's comment.
 */
export const getMyDuels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Duel[]> => {
    const { data } = await context.supabase.rpc("get_my_duels");
    return (data ?? []).map((r) => ({
      duelId: r.duel_id,
      challengerId: r.challenger_id,
      opponentId: r.opponent_id,
      course: r.course,
      status: r.status as DuelStatus,
      challengerXpStart: r.challenger_xp_start ?? 0,
      opponentXpStart: r.opponent_xp_start ?? 0,
      challengerXpNow: r.challenger_xp_now ?? 0,
      opponentXpNow: r.opponent_xp_now ?? 0,
      winnerId: r.winner_id,
      endsAt: r.ends_at,
    }));
  });
