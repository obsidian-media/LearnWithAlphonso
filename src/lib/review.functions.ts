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
  source: string;
  weaknessDisplay: string | null;
  prompt: string | null;
  choices: string[] | null;
  answerIndex: number | null;
  explanation: string | null;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

/**
 * Record questions answered incorrectly during a lesson. Previously
 * accepted arbitrary itemKeys with no proof the caller actually opened
 * this lesson -- a user could seed a review_items row (and, downstream,
 * farm the review-clear heart bonus) for any real lesson/question without
 * ever taking it. Now requires and verifies the same signed session token
 * completeLessonRemote does, and rejects any itemKey that doesn't
 * actually belong to this lesson's real question set.
 */
export const recordMisses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      lessonId: string;
      level: string;
      itemKeys: string[];
      course?: string;
      sessionToken: string;
    }) =>
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
          sessionToken: z.string().min(1).max(2000),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.itemKeys.length === 0) return { added: 0 };

    const { verifyLessonSessionToken } = await import("./lesson-session.server");
    if (
      !verifyLessonSessionToken(data.sessionToken, {
        userId,
        lessonId: data.lessonId,
        course: data.course,
      })
    ) {
      throw new Error("Invalid or expired lesson session");
    }

    const found = getCourse(data.course).findLesson(data.lessonId);
    if (!found) throw new Error("Invalid lesson");
    const realQuestionIds = new Set(found.lesson.questions.map((q) => q.id));
    for (const key of data.itemKeys) {
      const [lessonId, questionId] = key.split(":");
      if (lessonId !== data.lessonId || !realQuestionIds.has(questionId)) {
        throw new Error("Invalid item key for this lesson");
      }
    }

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
    // review_items no longer grants direct INSERT/UPDATE to `authenticated`
    // (see supabase/migrations/20260920050000_revoke_direct_gamification_writes.sql)
    // -- every row here is already validated against the real lesson's
    // question set above, so supabaseAdmin is the correct client for the
    // actual persist.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
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
        .select(
          "item_key,lesson_id,level,ease,interval_days,repetitions,due_on,source,weakness_display,prompt,choices,answer_index,explanation",
        )
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
      source: r.source,
      weaknessDisplay: r.weakness_display,
      prompt: r.prompt,
      choices: r.choices as string[] | null,
      answerIndex: r.answer_index,
      explanation: r.explanation,
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

    let correct: boolean;
    if (row.source === "weakness") {
      const choices = row.choices as string[] | null;
      correct = choices?.[row.answer_index as number] === data.answer;
    } else {
      const ref = getCourse(course).questionIndex[data.itemKey];
      if (!ref) throw new Error("Unknown review item");
      correct = deriveAnswerCorrectness(ref.question, data.answer);
    }

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

    // Same admin-write rationale as recordMisses above -- outcome is
    // already server-derived from the real question, not client-trusted.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
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
