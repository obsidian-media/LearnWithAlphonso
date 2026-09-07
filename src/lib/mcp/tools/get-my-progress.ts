import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_my_progress",
  title: "Get my learning progress",
  description:
    "Return the signed-in learner's English level, XP, streak, hearts, league tier and placement result.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const [progress, profile, completions] = await Promise.all([
      supabase.from("user_progress").select("*").eq("user_id", ctx.getUserId()!).maybeSingle(),
      supabase.from("profiles").select("display_name,country").eq("id", ctx.getUserId()!).maybeSingle(),
      supabase
        .from("lesson_completions")
        .select("lesson_id", { count: "exact", head: true })
        .eq("user_id", ctx.getUserId()!),
    ]);
    if (progress.error)
      return { content: [{ type: "text", text: progress.error.message }], isError: true };
    const summary = {
      displayName: profile.data?.display_name ?? null,
      country: profile.data?.country ?? null,
      level: progress.data?.cefr_level ?? "A1",
      xp: progress.data?.xp ?? 0,
      streak: progress.data?.streak ?? 0,
      longestStreak: progress.data?.longest_streak ?? 0,
      hearts: progress.data?.hearts ?? 0,
      leagueTier: progress.data?.league_tier ?? "bronze",
      lessonsCompleted: completions.count ?? 0,
      placement: progress.data?.placement_level
        ? { level: progress.data.placement_level, score: progress.data.placement_score }
        : null,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      structuredContent: summary,
    };
  },
});
