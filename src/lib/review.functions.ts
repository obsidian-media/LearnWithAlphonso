import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeReviewOutcome, deriveAnswerCorrectness } from "./srs";
import { getCourse } from "../data/courses";

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

/**
 * SM-2 style grading. `correct` used to be a raw client-supplied boolean
 * -- trivially fakeable (grade anything "correct" without answering it at
 * all), which combined with the review-clear heart bonus let a user
 * fabricate a review item via recordMisses and instantly "clear" the
 * queue for free. Now the client sends its submitted `answer`, and
 * correctness is re-derived server-side against the real question, the
 * same derive-don't-trust pattern completeLessonRemote already uses. Also
 * rejects grading an item that isn't actually due yet (due_on > today),
 * closing the other half of the same exploit path.
 */
export const gradeReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { itemKey: string; answer: string; course?: string }) =>
    z
      .object({
        itemKey: z
          .string()
          .min(1)
          .max(120)
          .regex(/^[a-z0-9]+:[a-z0-9]+$/, "invalid item key"),
        answer: z.string().max(200),
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
    if (row.due_on > today()) {
      throw new Error("This item isn't due yet");
    }

    const ref = getCourse(course).questionIndex[data.itemKey];
    if (!ref) throw new Error("Unknown review item");
    const correct = deriveAnswerCorrectness(ref.question, data.answer);

    const outcome = computeReviewOutcome(
      {
        correct,
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
 * queue in a day. Calls a SECURITY DEFINER RPC
 * (supabase/migrations/20260918141500_hearts_economy_rpcs.sql) that
 * re-checks the due count and the once-per-day guard atomically under a
 * row lock, rather than this handler's previous select-then-upsert (which
 * raced under concurrent calls).
 */
export const claimReviewClearBonusRemote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ course: courseSchema }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rpcData, error } = await supabase.rpc("claim_review_clear_bonus", {
      _course: data.course,
    });
    if (error) throw new Error("Could not check review-clear bonus");
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    return { granted: row?.granted ?? false, hearts: row?.hearts ?? null };
  });
