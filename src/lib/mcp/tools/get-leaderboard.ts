import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_leaderboard",
  title: "Get the XP leaderboard",
  description:
    "Return the XP leaderboard for a scope (global, friends, country) and period (week, all).",
  inputSchema: {
    scope: z.string().optional().describe("global, friends or country. Defaults to global."),
    period: z.string().optional().describe("week or all. Defaults to week."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ scope, period }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.rpc("get_leaderboard", {
      _scope: (scope ?? "global").toLowerCase(),
      _period: (period ?? "week").toLowerCase(),
    });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = (data ?? []).map(
      (r: { display_name: string; country: string | null; xp: number }, i: number) => ({
        rank: i + 1,
        displayName: r.display_name,
        country: r.country,
        xp: r.xp,
      }),
    );
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { count: rows.length, entries: rows },
    };
  },
});
