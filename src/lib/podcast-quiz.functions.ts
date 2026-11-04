import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { HOURLY_COMPLETION_LIMIT } from "./anti-farming";

export type PodcastQuizResult = {
  status: "applied";
  correct: number;
  total: number;
  xpGain: number;
  /** The learner's streak after this quiz (a quiz counts for the streak like a lesson). */
  streak: number;
  bestCorrect: number;
  bestXp: number;
  missedQuestionIds: string[];
};

const submitSchema = z.object({
  episodeId: z.string().uuid(),
  answers: z
    .array(
      z.object({
        questionId: z.string().regex(/^q[0-9]{1,2}$/),
        choiceIndex: z.number().int().min(0).max(3),
      }),
    )
    .min(1)
    .max(10),
  completedAt: z.string().datetime({ offset: true }).optional(),
});

/**
 * Submits the learner's answers to an episode's quiz. The score is never sent: the database grades the answers from
 * the stored key and pays 10 XP per correct answer, only the improvement over the learner's best, under the same
 * hourly ceiling as lessons (public.submit_podcast_quiz). Mirrors supabase/functions/complete-podcast-quiz, which the
 * native apps call. Throws the stable codes "rate-limited", "not-found" and "invalid-answers".
 */
export const completePodcastQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => submitSchema.parse(d))
  .handler(async ({ data, context }): Promise<PodcastQuizResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Not in the generated types until they are regenerated against a database that has the migration.
    const rpc = supabaseAdmin.rpc.bind(supabaseAdmin) as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: { status?: string } | null; error: { message: string } | null }>;
    const now = new Date();
    const { data: result, error } = await rpc("submit_podcast_quiz", {
      _user_id: context.userId,
      _episode_id: data.episodeId,
      _answers: data.answers,
      _at: now.toISOString(),
      _completed_at: data.completedAt ?? null,
      _limit: HOURLY_COMPLETION_LIMIT,
    });
    // Not fail-open like the lesson ceiling: the ceiling and the payout are one transaction, so an error means
    // nothing was paid and the client may retry.
    if (error || !result) throw new Error("Could not save the quiz; retry");
    if (result.status === "applied") return result as PodcastQuizResult;
    if (result.status === "not-found") throw new Error("not-found");
    if (result.status === "invalid") throw new Error("invalid-answers");
    if (result.status === "rate-limited") throw new Error("rate-limited");
    throw new Error("Could not save the quiz; retry");
  });

export type PodcastQuizQuestion = {
  id: string;
  prompt: string;
  choices: string[];
  answerIndex: number;
};

export type PodcastQuizOffer = {
  questions: PodcastQuizQuestion[];
  /** The learner's banked best for this episode, if any. */
  best: { correct: number; xp: number } | null;
};

type LooseQuery = {
  select: (cols: string) => LooseQuery;
  eq: (col: string, val: string) => LooseQuery;
  in: (
    col: string,
    vals: string[],
  ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
  order: (col: string) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
  maybeSingle: () => Promise<{
    data: Record<string, unknown> | null;
    error: { message: string } | null;
  }>;
};

/**
 * An episode's quiz, as the signed-in learner may see it. Read with the learner's own client, so the database's rules
 * decide: an unpublished episode returns nothing, exactly like its audio and transcript. An episode with no authored
 * quiz returns null and the UI offers nothing.
 */
export const fetchPodcastQuiz = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ episodeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<PodcastQuizOffer | null> => {
    // Not in the generated types until they are regenerated against a database that has the migration.
    const from = (context.supabase as unknown as { from: (t: string) => LooseQuery }).from.bind(
      context.supabase,
    );
    const qs = await from("podcast_quiz_questions")
      .select("id,prompt,choices,answer_index")
      .eq("episode_id", data.episodeId)
      .order("sort_order");
    if (qs.error) throw new Error(qs.error.message);
    const rows = (qs.data ?? []) as {
      id: string;
      prompt: string;
      choices: string[];
      answer_index: number;
    }[];
    if (rows.length === 0) return null;
    const award = await from("podcast_quiz_awards")
      .select("best_correct,best_xp")
      .eq("user_id", context.userId)
      .eq("episode_id", data.episodeId)
      .maybeSingle();
    // A failed read of the best score must not hide the quiz: it is only a label.
    const best =
      !award.error && award.data
        ? { correct: Number(award.data.best_correct), xp: Number(award.data.best_xp) }
        : null;
    return {
      questions: rows.map((r) => ({
        id: r.id,
        prompt: r.prompt,
        choices: r.choices,
        answerIndex: r.answer_index,
      })),
      best,
    };
  });

/**
 * Which of these episodes have a quiz the learner can open, for the "Take the quiz" button on an episode row. Read with
 * the learner's own client, so unpublished episodes never appear. A failed read means no buttons, not an error page.
 */
export const fetchQuizEpisodeIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ episodeIds: z.array(z.string().uuid()).max(200) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<string[]> => {
    if (data.episodeIds.length === 0) return [];
    const from = (context.supabase as unknown as { from: (t: string) => LooseQuery }).from.bind(
      context.supabase,
    );
    const rows = await from("podcast_quiz_questions")
      .select("episode_id")
      .in("episode_id", data.episodeIds);
    if (rows.error) throw new Error(rows.error.message);
    return [...new Set((rows.data ?? []).map((r) => (r as { episode_id: string }).episode_id))];
  });
