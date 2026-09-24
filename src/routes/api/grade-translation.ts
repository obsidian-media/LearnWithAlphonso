import { createFileRoute } from "@tanstack/react-router";
import { getCourse, isCourse, type Course } from "@/data/courses";
import { matchesAcceptableAnswer } from "@/lib/translation-answer";
import { gradeTranslationWithAi } from "@/lib/translation-grader.server";
import { resolveNvidiaChatModel } from "@/lib/nvidia-chat-model.server";

/**
 * Grades one written translation.
 *
 * Local-first: the submission is compared against the question's curated
 * `acceptableAnswers` for free, and only a miss reaches the AI grader. That
 * ordering is the whole cost model -- a learner writing one of the expected
 * phrasings never spends quota or waits on a vendor.
 *
 * Two things this deliberately does NOT do:
 *
 * - It does not trust `acceptableAnswers` from the request. The question is
 *   resolved from server-side content by id, so a client cannot widen what
 *   counts as correct by sending its own list.
 * - It does not fail the answer when the AI grader is unavailable. No key, a
 *   500, a timeout or exhausted quota all return the LOCAL verdict with
 *   `source: "local"`. A learner must never be marked wrong because a vendor
 *   was down, and the alternative -- erroring -- leaves them on a question they
 *   cannot get past, which is worse still: lesson completion needs an answer
 *   for every question.
 */
export type TranslationVerdict = {
  correct: boolean;
  reason: string | null;
  source: "local" | "ai";
};

export const Route = createFileRoute("/api/grade-translation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: {
          lessonId?: string;
          questionId?: string;
          submission?: string;
          course?: string;
        };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const lessonId = typeof body.lessonId === "string" ? body.lessonId : "";
        const questionId = typeof body.questionId === "string" ? body.questionId : "";
        const submission = typeof body.submission === "string" ? body.submission.trim() : "";
        const rawCourse = body.course ?? "";
        const course: Course = isCourse(rawCourse) ? rawCourse : "en";

        if (!lessonId || !questionId) {
          return Response.json({ error: "Missing lessonId or questionId" }, { status: 400 });
        }
        // An empty submission is not an answer. Returning 400 rather than
        // "incorrect" keeps it out of the learner's score and spends nothing.
        if (!submission) return Response.json({ error: "Empty submission" }, { status: 400 });

        const found = getCourse(course).findLesson(lessonId);
        const question = found?.lesson.questions.find((q) => q.id === questionId);
        if (!question) return Response.json({ error: "Unknown question" }, { status: 400 });
        if (question.type !== "translate") {
          return Response.json({ error: "Not a translation question" }, { status: 400 });
        }

        // Free, offline-capable, and final when it says yes.
        if (matchesAcceptableAnswer(submission, question.acceptableAnswers)) {
          return Response.json({
            correct: true,
            reason: null,
            source: "local",
          } satisfies TranslationVerdict);
        }

        const localVerdict: TranslationVerdict = { correct: false, reason: null, source: "local" };

        const key = process.env.NVIDIA_API_KEY;
        if (!key) return Response.json(localVerdict);

        // Quota is spent only now -- after the local list has already failed to
        // settle it, so the budget tracks real vendor calls rather than
        // answers.
        const { consumeQuota } = await import("@/lib/ai-quota.server");
        const quota = await consumeQuota(request, "translate");
        if (!quota.ok) return Response.json(localVerdict);

        const verdict = await gradeTranslationWithAi({
          prompt: question.prompt,
          acceptableAnswers: question.acceptableAnswers,
          submission,
          apiKey: key,
          model: resolveNvidiaChatModel(),
        });
        if (!verdict) return Response.json(localVerdict);

        return Response.json({
          correct: verdict.correct,
          reason: verdict.reason,
          source: "ai",
        } satisfies TranslationVerdict);
      },
    },
  },
});
