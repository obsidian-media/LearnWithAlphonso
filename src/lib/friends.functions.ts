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

type FriendRow = {
  user_id: string;
  display_name: string | null;
  avatar_seed: string | null;
  streak: number | null;
  week_xp: number | null;
};

/** Friends' account-wide streak + this-week XP, for the Friends tab. */
export const getFriends = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FriendEntry[]> => {
    const rpc = context.supabase.rpc as unknown as (
      fn: string,
    ) => Promise<{ data: FriendRow[] | null; error: unknown }>;
    const { data } = await rpc("get_friends_progress");
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
    const rpc = context.supabase.rpc as unknown as (
      fn: string,
      args: Record<string, string>,
    ) => Promise<{ data: { ok: boolean; message: string }[] | null; error: unknown }>;
    const { data: rows } = await rpc("accept_friend_invite", { _inviter_id: data.inviterId });
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
