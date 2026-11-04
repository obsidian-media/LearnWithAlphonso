import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { HOURLY_COMPLETION_LIMIT } from "./anti-farming";

export type PodcastQuizResult = {
  status: "applied";
  correct: number;
  total: number;
  xpGain: number;
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
      _today: now.toISOString().slice(0, 10),
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
