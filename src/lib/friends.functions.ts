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
 * Accepts a friend invite by its opaque per-user code (not the inviter's
 * uuid — see 20260930140000_fix_friend_invite_forgeable_uuid.sql's own
 * comment for why a uuid-keyed invite let any authenticated user force a
 * friendship on any other user with zero consent). Writes both friendship
 * directions atomically via a SECURITY DEFINER RPC, since a client can
 * only otherwise insert rows where it is user_id, not the other direction
 * of the pair. Self/blocked checks happen inside the RPC, which is the
 * only thing that can resolve a code back to a user id.
 */
export const acceptFriendInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { data: rows } = await context.supabase.rpc("accept_friend_invite", {
      _code: data.code,
    });
    const row = rows?.[0];
    return row ?? { ok: false, message: "unknown error" };
  });

/**
 * The caller's own shareable invite code (generated on first call,
 * stable after that) — what the "copy invite link" button on the
 * friends page turns into `/invite/<code>`.
 */
export const getMyFriendCode = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<string | null> => {
    const { data: rows } = await context.supabase.rpc("get_or_create_my_friend_code");
    return rows?.[0]?.code ?? null;
  });

/**
 * Removes a friendship (both directions, atomically) via the
 * `remove_friend` SECURITY DEFINER RPC (supabase/migrations/
 * 20260922020500_remove_friend.sql). Remove-only, no blocking -- see
 * that migration's header comment for why blocking was deliberately
 * left out of this slice.
 */
export const removeFriend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ friendId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { data: rows } = await context.supabase.rpc("remove_friend", {
      _friend_id: data.friendId,
    });
    const row = rows?.[0];
    return row ?? { ok: false, message: "unknown error" };
  });

/**
 * Display name + avatar for the invite confirmation screen, plus whether
 * this is the caller's own code — resolved server-side via
 * get_friend_invite_preview, the only thing that can look a code up
 * (friend_invite_codes has no client-facing SELECT policy at all).
 */
export const getFriendInvitePreview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase.rpc("get_friend_invite_preview", {
      _code: data.code,
    });
    const row = rows?.[0];
    if (!row?.ok) return null;
    return {
      isSelf: row.is_self,
      displayName: row.display_name,
      avatarSeed: row.avatar_seed,
    };
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
