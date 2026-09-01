import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ReviewItem = {
  itemKey: string;
  lessonId: string;
  level: string;
  ease: number;
  intervalDays: number;
  repetitions: number;
  dueOn: string;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

/** Record questions answered incorrectly during a lesson. */
export const recordMisses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { lessonId: string; level: string; itemKeys: string[] }) =>
    z
      .object({
        lessonId: z.string().min(1).max(80),
        level: z.string().min(2).max(4),
        itemKeys: z.array(z.string().min(1).max(120)).max(40),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.itemKeys.length === 0) return { added: 0 };
    const rows = data.itemKeys.map((key) => ({
      user_id: userId,
      item_key: key,
      lesson_id: data.lessonId,
      level: data.level,
      ease: 2.3,
      interval_days: 0,
      repetitions: 0,
      due_on: today(),
    }));
    const { error } = await supabase
      .from("review_items")
      .upsert(rows, { onConflict: "user_id,item_key" });
    if (error) throw new Error(error.message);
    return { added: rows.length };
  });

/** Items due today (plus overdue), oldest first. */
export const fetchDueReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ due: ReviewItem[]; total: number }> => {
    const { supabase, userId } = context;
    const [dueRes, totalRes] = await Promise.all([
      supabase
        .from("review_items")
        .select("item_key,lesson_id,level,ease,interval_days,repetitions,due_on")
        .eq("user_id", userId)
        .lte("due_on", today())
        .order("due_on", { ascending: true })
        .limit(20),
      supabase
        .from("review_items")
        .select("item_key", { count: "exact", head: true })
        .eq("user_id", userId),
    ]);
    const due = (dueRes.data ?? []).map((r) => ({
      itemKey: r.item_key,
      lessonId: r.lesson_id,
      level: r.level,
      ease: r.ease,
      intervalDays: r.interval_days,
      repetitions: r.repetitions,
      dueOn: r.due_on,
    }));
    return { due, total: totalRes.count ?? 0 };
  });

/** SM-2 style grading. correct=false resets the item; three clean reps retires it. */
export const gradeReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { itemKey: string; correct: boolean }) =>
    z.object({ itemKey: z.string().min(1).max(120), correct: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("review_items")
      .select("*")
      .eq("user_id", userId)
      .eq("item_key", data.itemKey)
      .maybeSingle();
    if (!row) return { retired: false, dueOn: today() };

    if (!data.correct) {
      const ease = Math.max(1.3, row.ease - 0.2);
      await supabase
        .from("review_items")
        .update({
          ease,
          interval_days: 0,
          repetitions: 0,
          lapses: row.lapses + 1,
          due_on: today(),
          last_reviewed_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("item_key", data.itemKey);
      return { retired: false, dueOn: today() };
    }

    const repetitions = row.repetitions + 1;
    const ease = Math.min(2.8, row.ease + 0.15);
    if (repetitions >= 4) {
      await supabase
        .from("review_items")
        .delete()
        .eq("user_id", userId)
        .eq("item_key", data.itemKey);
      return { retired: true, dueOn: today() };
    }
    const intervalDays =
      repetitions === 1 ? 1 : repetitions === 2 ? 3 : Math.round(row.interval_days * ease) || 6;
    const dueOn = addDays(intervalDays);
    await supabase
      .from("review_items")
      .update({
        ease,
        repetitions,
        interval_days: intervalDays,
        due_on: dueOn,
        last_reviewed_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("item_key", data.itemKey);
    return { retired: false, dueOn };
  });
