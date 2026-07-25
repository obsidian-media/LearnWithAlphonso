import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LeaderboardEntry = {
  user_id: string;
  display_name: string;
  country: string | null;
  avatar_seed: string;
  xp: number;
  isYou: boolean;
};

const schema = z.object({
  scope: z.enum(["global", "friends", "country"]),
  period: z.enum(["weekly", "all-time"]),
});

function weekStart() {
  const d = new Date();
  const day = d.getUTCDay(); // 0=Sun
  const diff = (day + 6) % 7; // Monday start
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

export const getLeaderboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }): Promise<LeaderboardEntry[]> => {
    const { supabase, userId } = context;

    // decide user id pool
    let userIds: string[] | null = null;
    if (data.scope === "friends") {
      const { data: fr } = await supabase
        .from("friendships")
        .select("friend_id")
        .eq("user_id", userId)
        .eq("status", "accepted");
      userIds = [userId, ...(fr ?? []).map((r) => r.friend_id as string)];
    } else if (data.scope === "country") {
      const { data: me } = await supabase
        .from("profiles")
        .select("country")
        .eq("id", userId)
        .maybeSingle();
      if (!me?.country) return [];
      const { data: mates } = await supabase
        .from("profiles")
        .select("id")
        .eq("country", me.country);
      userIds = (mates ?? []).map((r) => r.id as string);
    }

    // xp source
    const xpByUser = new Map<string, number>();
    if (data.period === "weekly") {
      let q = supabase
        .from("activity_days")
        .select("user_id,xp_earned")
        .gte("day", weekStart());
      if (userIds) q = q.in("user_id", userIds);
      const { data: rows } = await q;
      for (const r of rows ?? []) {
        xpByUser.set(
          r.user_id as string,
          (xpByUser.get(r.user_id as string) ?? 0) + (r.xp_earned as number),
        );
      }
    } else {
      let q = supabase.from("user_progress").select("user_id,xp");
      if (userIds) q = q.in("user_id", userIds);
      const { data: rows } = await q;
      for (const r of rows ?? []) xpByUser.set(r.user_id as string, r.xp as number);
    }

    // ensure "you" is present even at 0
    if (!xpByUser.has(userId)) xpByUser.set(userId, 0);

    const ids = Array.from(xpByUser.keys());
    if (ids.length === 0) return [];

    const { data: profs } = await supabase
      .from("profiles")
      .select("id,display_name,country,avatar_seed")
      .in("id", ids);
    const pMap = new Map((profs ?? []).map((p) => [p.id as string, p]));

    const entries: LeaderboardEntry[] = ids.map((id) => ({
      user_id: id,
      display_name: pMap.get(id)?.display_name ?? "Learner",
      country: (pMap.get(id)?.country as string | null) ?? null,
      avatar_seed: (pMap.get(id)?.avatar_seed as string) ?? "0",
      xp: xpByUser.get(id) ?? 0,
      isYou: id === userId,
    }));
    entries.sort((a, b) => b.xp - a.xp);
    return entries.slice(0, 50);
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        display_name: z.string().min(1).max(40).optional(),
        country: z.string().max(2).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase.from("profiles").update(data).eq("id", userId);
    return { ok: true };
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("*")
      .eq("id", context.userId)
      .maybeSingle();
    return data;
  });