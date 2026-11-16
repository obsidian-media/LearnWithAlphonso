import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { profileErrorCode } from "./profile-error";
import { isAllowedAvatarSeed } from "./profile-avatars";
import { mondayDateString } from "./league-engagement";

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

export type WeeklyRecap = {
  /** XP earned between last Monday and this Monday (UTC, the server's week), from the learner's own activity days. */
  lastWeekXp: number;
  /** Today's rank on the global weekly board, or null when the learner is not on it. Approximate for last week. */
  currentRank: number | null;
};

/**
 * The weekly recap, derived the way the apps do (LeaderboardViewModel.loadRecap): last week's XP is the sum of the
 * caller's own `activity_days` between the two Mondays, and the rank is where they stand on today's global weekly
 * board (there is no snapshot of last week's exact standings, and the sheet says so). Both reads are the caller's
 * own and the board is the same `get_leaderboard` that already hides blocked learners, so nothing new about anyone
 * else is exposed. A part that cannot be read comes back as 0 / null: the recap is a nicety, never an error screen.
 */
export const getWeeklyRecap = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WeeklyRecap> => {
    const { supabase, userId } = context;
    const now = Date.now();
    const [days, board] = await Promise.all([
      supabase
        .from("activity_days")
        .select("xp_earned")
        .eq("user_id", userId)
        .gte("day", mondayDateString(1, now))
        .lt("day", mondayDateString(0, now)),
      supabase.rpc("get_leaderboard", { _scope: "global", _period: "weekly" }),
    ]);
    const lastWeekXp = days.error
      ? 0
      : (days.data ?? []).reduce((sum, r) => sum + (r.xp_earned ?? 0), 0);
    const index = board.error ? -1 : (board.data ?? []).findIndex((r) => r.user_id === userId);
    return { lastWeekXp, currentRank: index >= 0 ? index + 1 : null };
  });

export type UpdateProfileResult =
  | { ok: true }
  | {
      ok: false;
      error: "blocked-content" | "invalid-name" | "server-error";
      /** Which write failed: the name (nothing saved), or the other fields (the name, if sent, was saved). */
      part: "name" | "details";
    };

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        display_name: z.string().min(1).max(40).optional(),
        // A two-letter country code, as the database requires (profiles_country_iso2).
        country: z
          .string()
          .regex(/^[A-Z]{2}$/)
          .optional()
          .nullable(),
        // Meadow stays Meadow; a retired or unknown value (an older app build) is stored as Royal, never an error.
        theme: z
          .string()
          .max(40)
          .transform((v) => (v === "meadow" ? "meadow" : "royal"))
          .optional(),
        // A colour seed, or one of the 16 preset animal pictures (profile-avatars.ts). Never a URL.
        avatar_seed: z.string().min(1).max(32).refine(isAllowedAvatarSeed).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<UpdateProfileResult> => {
    const { supabase, userId } = context;
    const { display_name, ...rest } = data;
    if (display_name !== undefined) {
      // The validated path: 2 to 40 characters, the name filter, and the confirmation stamp.
      const { error } = await supabase.rpc("confirm_display_name", { _name: display_name });
      if (error) return { ok: false, error: profileErrorCode(error), part: "name" };
    }
    if (Object.keys(rest).length > 0) {
      const { error } = await supabase.from("profiles").update(rest).eq("id", userId);
      if (error) return { ok: false, error: "server-error", part: "details" };
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
