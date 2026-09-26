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

export const getLeaderboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }): Promise<LeaderboardEntry[]> => {
    const { supabase, userId } = context;
    const { data: rows } = await supabase.rpc("get_leaderboard", {
      _scope: data.scope,
      _period: data.period,
    });

    const entries: LeaderboardEntry[] = (rows ?? []).map((r) => ({
      user_id: r.user_id,
      display_name: r.display_name ?? "Learner",
      country: r.country,
      avatar_seed: r.avatar_seed ?? "0",
      xp: r.xp ?? 0,
      isYou: r.user_id === userId,
    }));
    return entries;
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        display_name: z.string().min(1).max(40).optional(),
        country: z.string().max(2).optional().nullable(),
        theme: z.enum(["meadow", "studio-ink", "manuscript", "canopy"]).optional(),
        avatar_seed: z.string().min(1).max(32).optional(),
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
