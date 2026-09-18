import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeReviewOutcome } from "./srs";
import { MAX_HEARTS, gainHearts, resolveHeartsRefill } from "./hearts";

/** Same course-awareness pattern as sync.functions.ts. */
const courseSchema = z.enum(["en", "fr"]).default("en");

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
  .inputValidator((d: { lessonId: string; level: string; itemKeys: string[]; course?: string }) =>
    z
      .object({
        lessonId: z
          .string()
          .min(1)
          .max(80)
          .regex(/^[a-z0-9]+$/, "invalid lesson id"),
        level: z.string().min(2).max(4),
        itemKeys: z
          .array(
            z
              .string()
              .min(1)
              .max(120)
              .regex(/^[a-z0-9]+:[a-z0-9]+$/, "invalid item key"),
          )
          .max(40),
        course: courseSchema,
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
      language: data.course,
      ease: 2.3,
      interval_days: 0,
      repetitions: 0,
      due_on: today(),
    }));
    const { error } = await supabase
      .from("review_items")
      .upsert(rows, { onConflict: "user_id,item_key,language" });
    if (error) throw new Error(error.message);
    return { added: rows.length };
  });

/** Items due today (plus overdue), oldest first, for the given course. */
export const fetchDueReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ course: courseSchema }).parse(d ?? {}))
  .handler(async ({ data, context }): Promise<{ due: ReviewItem[]; total: number }> => {
    const { supabase, userId } = context;
    const { course } = data;
    const [dueRes, totalRes] = await Promise.all([
      supabase
        .from("review_items")
        .select("item_key,lesson_id,level,ease,interval_days,repetitions,due_on")
        .eq("user_id", userId)
        .eq("language", course)
        .lte("due_on", today())
        .order("due_on", { ascending: true })
        .limit(20),
      supabase
        .from("review_items")
        .select("item_key", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("language", course),
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
  .inputValidator((d: { itemKey: string; correct: boolean; course?: string }) =>
    z
      .object({
        itemKey: z
          .string()
          .min(1)
          .max(120)
          .regex(/^[a-z0-9]+:[a-z0-9]+$/, "invalid item key"),
        correct: z.boolean(),
        course: courseSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { course } = data;
    const { data: row } = await supabase
      .from("review_items")
      .select("*")
      .eq("user_id", userId)
      .eq("item_key", data.itemKey)
      .eq("language", course)
      .maybeSingle();
    if (!row) return { retired: false, dueOn: today() };

    const outcome = computeReviewOutcome(
      {
        correct: data.correct,
        ease: row.ease,
        intervalDays: row.interval_days,
        repetitions: row.repetitions,
        lapses: row.lapses,
      },
      today(),
      addDays,
    );

    if (outcome.retired) {
      await supabase
        .from("review_items")
        .delete()
        .eq("user_id", userId)
        .eq("item_key", data.itemKey)
        .eq("language", course);
      return { retired: true, dueOn: outcome.dueOn };
    }

    await supabase
      .from("review_items")
      .update({
        ease: outcome.ease,
        interval_days: outcome.intervalDays,
        repetitions: outcome.repetitions,
        lapses: outcome.lapses,
        due_on: outcome.dueOn,
        last_reviewed_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("item_key", data.itemKey)
      .eq("language", course);
    return { retired: false, dueOn: outcome.dueOn };
  });

/**
 * Awards a heart the first time a user clears their entire due-review
 * queue in a day. Guarded by `last_review_bonus_date` (once per calendar
 * day) and by re-checking the due count server-side -- the client can't
 * claim this by simply asserting the queue is empty.
 */
export const claimReviewClearBonusRemote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ course: courseSchema }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { count } = await supabase
      .from("review_items")
      .select("item_key", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("language", data.course)
      .lte("due_on", today());
    if ((count ?? 0) > 0) return { granted: false, hearts: null };

    const todayStr = today();
    const { data: p } = await supabase
      .from("user_progress")
      .select("hearts,hearts_refill_at,last_review_bonus_date")
      .eq("user_id", userId)
      .maybeSingle();
    if (p?.last_review_bonus_date === todayStr) {
      return { granted: false, hearts: p.hearts };
    }

    const resolved = resolveHeartsRefill(
      p?.hearts ?? MAX_HEARTS,
      p?.hearts_refill_at ? new Date(p.hearts_refill_at).getTime() : null,
      Date.now(),
    );
    const next = gainHearts(resolved.hearts, 1);
    await supabase.from("user_progress").upsert({
      user_id: userId,
      hearts: next.hearts,
      hearts_refill_at: null,
      last_review_bonus_date: todayStr,
    });
    return { granted: next.hearts > resolved.hearts, hearts: next.hearts };
  });
