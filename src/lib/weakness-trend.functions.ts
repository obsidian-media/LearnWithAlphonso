import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type WeaknessTrendEntry = {
  category: string;
  detectedCount: number;
  resolvedCount: number;
  openCount: number;
  lastEventAt: string;
};

/**
 * Aggregates weakness_events (see supabase/migrations/
 * 20260921000000_v3_weakness_trend_log.sql) into a per-category trend --
 * how many times a gap was detected vs. resolved, so the profile screen
 * can show real improvement over time instead of just the current
 * (ever-changing) review_items snapshot. No `course` param: weakness
 * detection itself is English-only today (see analyze-weaknesses.ts's
 * hardcoded `language: "en"` on the review_items it creates), so there's
 * nothing to filter by yet.
 *
 * `openCount` is `max(0, detected - resolved)`, not just "not yet
 * resolved" -- a category can be detected again after being resolved
 * once (a relapse), and each detected/resolved pair should cancel out
 * rather than accumulate forever.
 */
export const getWeaknessTrend = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ categories: WeaknessTrendEntry[] }> => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("weakness_events")
      .select("category,event_type,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    const byCategory = new Map<
      string,
      { detected: number; resolved: number; lastEventAt: string }
    >();
    for (const row of data ?? []) {
      const entry = byCategory.get(row.category) ?? {
        detected: 0,
        resolved: 0,
        lastEventAt: row.created_at,
      };
      if (row.event_type === "detected") entry.detected += 1;
      else entry.resolved += 1;
      entry.lastEventAt = row.created_at;
      byCategory.set(row.category, entry);
    }

    const categories = [...byCategory.entries()]
      .map(([category, v]) => ({
        category,
        detectedCount: v.detected,
        resolvedCount: v.resolved,
        openCount: Math.max(0, v.detected - v.resolved),
        lastEventAt: v.lastEventAt,
      }))
      .sort((a, b) => b.openCount - a.openCount || b.lastEventAt.localeCompare(a.lastEventAt));

    return { categories };
  });
