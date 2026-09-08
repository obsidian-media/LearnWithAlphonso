import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_due_reviews",
  title: "Get due review items",
  description:
    "List the spaced-repetition items the signed-in learner should practise today, oldest first.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("review_items")
      .select("item_key,lesson_id,level,due_on,repetitions,lapses")
      .eq("user_id", ctx.getUserId()!)
      .lte("due_on", today)
      .order("due_on", { ascending: true })
      .limit(50);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const items = data ?? [];
    return {
      content: [
        {
          type: "text",
          text: items.length
            ? JSON.stringify(items, null, 2)
            : "Nothing is due for review right now.",
        },
      ],
      structuredContent: { count: items.length, items },
    };
  },
});
