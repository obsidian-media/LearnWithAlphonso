// Edge twin of the web server's AI cost writer (src/lib/ai-cost-log.server.ts, 20261118200000_ai_cost_log.sql).
// The edge functions that make a billable AI call (a written translation grade, in grade-review and complete-lesson)
// log it here. There is NO price table on this side (the one table is src/lib/ai-prices.ts): the cost is the provider's
// own reported charge, and a reply that reports none is logged with a NULL cost, flagged "unknown", never guessed.
// A failed write never reaches the caller: everything here is caught.
// A structural type, not the supabase-js one: the Deno test job cannot resolve that package.
type CostLogAdmin = {
  from: (table: string) => {
    insert: (row: unknown) => PromiseLike<{ error: { message: string } | null }>;
  };
};

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;

/** The ai_cost_log row for a chat-completion reply body, or null when the body is not an object. */
export function costRowFromReply(
  userId: string,
  kind: string,
  requestedModel: string,
  body: unknown,
): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { model?: unknown; usage?: unknown };
  const u = b.usage && typeof b.usage === "object" ? (b.usage as Record<string, unknown>) : {};
  const details =
    u.cost_details && typeof u.cost_details === "object"
      ? (u.cost_details as Record<string, unknown>)
      : {};
  const cost = num(u.cost);
  const upstream = num(details.upstream_inference_cost);
  // Same rule as the web twin (ai-cost.ts llmCostMicro): with BYOK the real spend is the fee plus the host's charge.
  const reported = cost === null && upstream === null ? null : (cost ?? 0) + (upstream ?? 0);
  const tokens = (v: unknown) => (num(v) === null ? null : Math.round(v as number));
  return {
    user_id: userId,
    kind,
    vendor: "openrouter",
    model: (typeof b.model === "string" && b.model ? b.model : requestedModel).slice(0, 120),
    input_tokens: tokens(u.prompt_tokens),
    output_tokens: tokens(u.completion_tokens),
    cost_micro_usd: reported === null ? null : Math.round(reported * 1_000_000),
    cost_source: reported === null ? "unknown" : "provider",
    cache_hit: false,
  };
}

/** A recorder for one learner's translate grading; pass it as the grader's onUsage. Never throws. */
export function makeTranslateCostLogger(
  admin: CostLogAdmin,
  userId: string,
): (body: unknown, requestedModel: string) => Promise<void> {
  return async (body, requestedModel) => {
    try {
      const row = costRowFromReply(userId, "translate", requestedModel, body);
      if (!row) return;
      const { error } = await admin.from("ai_cost_log").insert(row);
      if (error) console.error("[ai-cost] write failed:", error.message);
    } catch (e) {
      console.error("[ai-cost] write failed:", e instanceof Error ? e.message : "error");
    }
  };
}
