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

export type UpdateProfileResult =
  { ok: true } | { ok: false; error: "blocked-content" | "invalid-name" | "server-error" };

/** confirm_display_name raises P0001 with the code as the message; anything else is a server failure. */
function profileErrorCode(
  error: { message?: string } | null,
): "blocked-content" | "invalid-name" | "server-error" {
  if (error?.message === "blocked-content") return "blocked-content";
  if (error?.message === "invalid-name") return "invalid-name";
  return "server-error";
}

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
  .handler(async ({ data, context }): Promise<UpdateProfileResult> => {
    const { supabase, userId } = context;
    const { display_name, ...rest } = data;
    if (display_name !== undefined) {
      // The validated path: 2 to 40 characters, the name filter, and the confirmation stamp.
      const { error } = await supabase.rpc("confirm_display_name", { _name: display_name });
      if (error) return { ok: false, error: profileErrorCode(error) };
    }
    if (Object.keys(rest).length > 0) {
      const { error } = await supabase.from("profiles").update(rest).eq("id", userId);
      if (error) return { ok: false, error: "server-error" };
    }
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
