import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { QUESTS, QUESTS_BY_ID, currentWeekStart } from "../data/quests";
import { publicError } from "./public-error";

const courseSchema = z.enum(["en", "fr", "es"]).default("en");

export type QuestStatus = {
  questId: string;
  progress: number;
  target: number;
  claimed: boolean;
};

/**
 * Progress is computed on the fly from already-durable data
 * (activity_days / lesson_completions), not a separately-tracked
 * counter -- see the migration's own comment for why. Claim state comes
 * from user_weekly_quest_claims, readable directly under RLS (no
 * gamification value on that table itself, just a claim ledger).
 */
export const getWeeklyQuestProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ course: courseSchema }).parse(d ?? {}))
  .handler(async ({ data, context }): Promise<QuestStatus[]> => {
    const { supabase, userId } = context;
    const weekStart = currentWeekStart();
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);

    const [activity, completions, claimRows] = await Promise.all([
      supabase
        .from("activity_days")
        .select("xp_earned")
        .eq("user_id", userId)
        .gte("day", weekStart)
        .lt("day", weekEndStr),
      supabase
        .from("lesson_completions")
        .select("id")
        .eq("user_id", userId)
        .eq("language", data.course)
        .gte("completed_at", weekStart)
        .lt("completed_at", weekEndStr),
      supabase
        .from("user_weekly_quest_claims")
        .select("quest_id")
        .eq("user_id", userId)
        .eq("week_start", weekStart),
    ]);
    // A failed read must not show zero progress (or an unclaimed quest as claimable): fail the whole call instead.
    const failed = activity.error ?? completions.error ?? claimRows.error;
    if (failed) throw publicError("getWeeklyQuestProgress", failed);
    const activityRows = activity.data;
    const completionRows = completions.data;
    const claims = claimRows.data;

    const xpThisWeek = (activityRows ?? []).reduce((sum, r) => sum + (r.xp_earned ?? 0), 0);
    const lessonsThisWeek = completionRows?.length ?? 0;
    const claimedIds = new Set((claims ?? []).map((c) => c.quest_id));

    return QUESTS.map((q) => ({
      questId: q.id,
      progress: q.metric === "xp_earned" ? xpThisWeek : lessonsThisWeek,
      target: q.target,
      claimed: claimedIds.has(q.id),
    }));
  });

/** `xp` is the reward this claim paid; `totalXp` is the course's XP after it (what the RPC returns as `xp`). */
export type ClaimQuestResult =
  { ok: true; xp: number; totalXp: number } | { ok: false; reason: string };

/** Only weekly_quests ids go to claim_weekly_quest. A weekly CHALLENGE template id (lessons_5) is a different id space. */
const questIdSchema = z.string().refine((id) => id in QUESTS_BY_ID, "unknown-quest");

export const claimWeeklyQuest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ questId: questIdSchema, course: courseSchema }).parse(d),
  )
  .handler(async ({ data, context }): Promise<ClaimQuestResult> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("claim_weekly_quest", {
      _quest_id: data.questId,
      _course: data.course,
      _week_start: currentWeekStart(),
    });
    if (error) return { ok: false, reason: "server-error" };
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row?.ok) return { ok: false, reason: row?.reason ?? "unknown-error" };
    const totalXp = row.xp ?? 0;
    return { ok: true, xp: QUESTS_BY_ID[data.questId]?.xpReward ?? 0, totalXp };
  });
