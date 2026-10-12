import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeReviewOutcome, deriveAnswerCorrectness } from "./srs";
import { getCourse } from "../data/courses";

/** Same course-awareness pattern as sync.functions.ts. */
const courseSchema = z.enum(["en", "fr", "es"]).default("en");

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
 *
 * Returns `correct` as well as the schedule, because for a "translate" item
 * the server is the only place that knows the answer: the player's local match
 * is a floor, and the AI second opinion that can lift it runs here. The review
 * player DISPLAYS this value rather than computing its own, which is what
 * makes a disagreement between the two impossible rather than merely unlikely.
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
    const { data: row, error: rowError } = await supabase
      .from("review_items")
      .select("*")
      .eq("user_id", userId)
      .eq("item_key", data.itemKey)
      .eq("language", course)
      .maybeSingle();
    if (rowError) throw new Error("Could not load review item");
    if (!row) return { retired: false, dueOn: today(), correct: false };
    if (row.due_on > today()) {
      throw new Error("This item isn't due yet");
    }

    let correct: boolean;
    // 'weakness' and 'saved_word' rows are self-contained: the stored choices
    // and answer_index ARE the answer key (there is no lesson question to look up).
    if (row.source === "weakness" || row.source === "saved_word") {
      const choices = row.choices as string[] | null;
      correct = choices?.[row.answer_index as number] === data.answer;
    } else {
      const ref = getCourse(course).questionIndex[data.itemKey];
      if (!ref) throw new Error("Unknown review item");
      correct = deriveAnswerCorrectness(ref.question, data.answer, course);
      // A written translation gets the same second opinion the lesson player
      // asks for. This is the web review path -- the grade-review Edge
      // Function is iOS's -- and without it a phrasing the player accepted
      // would be re-derived here by string comparison alone, so the learner
      // would read "Still got it" while the scheduler lapsed the item.
      //
      // The AI verdict can only ever upgrade a local miss. A null (vendor
      // down, no key, unparseable answer, or quota exhausted) leaves the
      // local verdict standing: being offline is not evidence about the
      // learner's English.
      //
      // Found in a whole-codebase audit (2026-09-29): this was the one AI
      // cost path in the app with no quota/rate-limit enforcement at all --
      // every other one (chat, tts, stt, analyze-weaknesses, hector-respond,
      // and this same grader's own /api/grade-translation route) enforces
      // it. A review item's own `due_on` gate limits how often ONE item can
      // be re-graded, but not how many DIFFERENT due items a user churns
      // through, so it was a real unbounded-NVIDIA-spend gap.
      if (!correct && ref.question.type === "translate" && data.answer.trim()) {
        const apiKey = process.env.NVIDIA_API_KEY;
        const { hasAiConsent } = await import("./ai-consent.server");
        if (apiKey && (await hasAiConsent(supabase, userId))) {
          const { consumeQuota } = await import("./ai-quota.server");
          const quota = await consumeQuota(getRequest(), "translate");
          if (quota.ok) {
            const [{ gradeTranslationWithAi }, { resolveNvidiaChatModel }] = await Promise.all([
              import("./translation-grader.server"),
              import("./nvidia-chat-model.server"),
            ]);
            const verdict = await gradeTranslationWithAi({
              prompt: ref.question.prompt,
              acceptableAnswers: ref.question.acceptableAnswers,
              submission: data.answer,
              apiKey,
              model: resolveNvidiaChatModel(),
            });
            if (verdict?.correct) correct = true;
          }
        }
      }
    }

    // Real elapsed time since the item was last actually reviewed (falling
    // back to its creation time for a never-yet-reviewed item) -- feeds
    // computeReviewGrade's overdue-growth bonus. See that function's doc
    // comment for why this must be measured against the real review date,
    // not due_on.
    const sinceIso = row.last_reviewed_at ?? row.created_at;
    const elapsedDays = Math.max(
      0,
      Math.round((Date.now() - new Date(sinceIso).getTime()) / 86400000),
    );

    const outcome = computeReviewOutcome(
      {
        correct,
        ease: row.ease,
        intervalDays: row.interval_days,
        repetitions: row.repetitions,
        lapses: row.lapses,
        elapsedDays,
      },
      today(),
      addDays,
    );

    // Both the review mutation and a weakness-resolution event now happen
    // in one database transaction. The RPC is service-role-only; the
    // correctness/outcome above are still derived on the server.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    type Transition = { status: string; retired?: boolean; dueOn?: string; correct?: boolean };
    const { data: transition, error: transitionError } = (await supabaseAdmin.rpc(
      "apply_review_grade" as never,
      {
        _user_id: userId,
        _item_key: data.itemKey,
        _language: course,
        _attempt_id: null,
        _expected_last_reviewed_at: row.last_reviewed_at,
        _expected_due_on: row.due_on,
        _retired: outcome.retired,
        _correct: correct,
        _new_due_on: outcome.dueOn,
        _ease: outcome.retired ? null : outcome.ease,
        _interval_days: outcome.retired ? null : outcome.intervalDays,
        _repetitions: outcome.retired ? null : outcome.repetitions,
        _lapses: outcome.retired ? null : outcome.lapses,
      } as never,
    )) as { data: Transition | null; error: { message: string } | null };
    if (transitionError || !transition) throw new Error("Could not save review grade");
    if (transition.status === "conflict") throw new Error("Review changed; retry");
    if (transition.status === "not_due") throw new Error("This item isn't due yet");
    if (transition.status === "missing") return { retired: false, dueOn: today(), correct: false };
    if (transition.status !== "applied" || transition.retired === undefined || !transition.dueOn) {
      throw new Error("Unknown review transition");
    }
    return {
      retired: transition.retired,
      dueOn: transition.dueOn,
      correct: transition.correct ?? correct,
    };
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
