import { z } from "zod";
import { nvidiaChatCompletion } from "./nvidia-chat.server";

/**
 * V3 pkg 4b: "generative sentence content" -- on-demand extra practice
 * per lesson. Same NVIDIA NIM integration as weakness-detection.server.ts,
 * same defensive-parse reasoning (no structured-output mode is used
 * anywhere in this codebase, so never assume clean JSON from the model).
 * Generated questions are ephemeral: never persisted, never counted
 * toward XP/hearts/review scheduling -- purely supplementary practice a
 * learner can do immediately after a lesson, same posture as V3 pkg 4b's
 * in-lesson reinforcement.
 */
const practiceQuestionSchema = z.object({
  prompt: z.string().min(1).max(300),
  choices: z.array(z.string().min(1).max(120)).length(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(1).max(300),
});
const practiceQuestionsSchema = z.array(practiceQuestionSchema).max(5);
export type GeneratedPracticeQuestion = z.infer<typeof practiceQuestionSchema>;

/** Never throws -- any parse/shape failure yields an empty array. */
export function parsePracticeQuestions(content: string): GeneratedPracticeQuestion[] {
  const stripped = content.replace(/```json\s*|```\s*/g, "").trim();
  try {
    const parsed: unknown = JSON.parse(stripped);
    const result = practiceQuestionsSchema.safeParse(parsed);
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

export function practicePrompt(
  topic: string,
  sampleQuestions: { prompt: string; answer: string }[],
): string {
  const examples = sampleQuestions.map((q) => `- "${q.prompt}" (answer: "${q.answer}")`).join("\n");
  return (
    `A learner just practiced this lesson topic: "${topic}". Here are example ` +
    `questions from that lesson:\n${examples}\n\n` +
    `Write 3-5 NEW multiple-choice questions testing the exact same topic and ` +
    `similar difficulty, but with different content -- never repeat the examples ` +
    `above verbatim. Respond with ONLY a JSON array, no other text, in this exact ` +
    `shape: [{"prompt": "<question text>", "choices": ["<4 options>"], ` +
    `"answerIndex": <0-3>, "explanation": "<why>"}]. If you can't write good ` +
    `questions for this topic, respond with [].`
  );
}

/**
 * Calls NVIDIA NIM with `practicePrompt` and parses the result. Never
 * throws -- any upstream/parse failure just yields an empty array,
 * matching analyze-weaknesses' fail-quiet design (this is a nice-to-have
 * layered on top of the real lesson, not a trust boundary itself).
 *
 * TestFlight feedback (2026-09-29): "after 30 seconds ... error, something
 * went wrong." Real Vercel logs for the actual attempts show the route
 * returning 200 both times checked -- this function genuinely never
 * threw, so the client's error came from somewhere upstream of the
 * response ever arriving intact (most likely just this call taking long
 * enough to collide with the client's own request timeout or a network
 * hiccup, not a server bug). Two real, defensible improvements
 * regardless of the exact cause: `max_tokens` was never bounded (an
 * unbounded completion is unbounded latency risk for a JSON array that
 * should never need more than a few hundred tokens), and the fetch
 * itself had no timeout, so a truly stuck upstream call could run for
 * the whole function's execution budget instead of failing fast.
 * `durationMs` is logged on every outcome (not just failures) so a real
 * recurrence gives an exact number instead of another guess.
 *
 * 2026-09-30, real production logs from live use confirmed a regression
 * in the fix above: `[generate-practice] 0 questions in 4172ms` -- a
 * fast, non-erroring call that still returned nothing. 800 tokens is
 * tight for up to 5 questions once each one's prompt/4 choices/
 * explanation and JSON punctuation are accounted for (the schema alone
 * allows up to ~1500 tokens of content before overhead), so a real
 * completion the model would otherwise have finished cleanly could get
 * cut off mid-JSON and fail parsePracticeQuestions' parse -- silently,
 * since a parse failure and a genuine "no good questions" model
 * response both already return an empty array by design. Raised with
 * real headroom; still far below what would meaningfully affect
 * latency for a JSON array this small.
 */
export async function generatePracticeQuestions(params: {
  topic: string;
  sampleQuestions: { prompt: string; answer: string }[];
  nvidiaApiKey: string;
  nvidiaModel: string;
}): Promise<GeneratedPracticeQuestion[]> {
  if (params.sampleQuestions.length === 0) return [];
  const startedAt = Date.now();
  try {
    const resp = await nvidiaChatCompletion({
      apiKey: params.nvidiaApiKey,
      signal: AbortSignal.timeout(20_000),
      body: {
        model: params.nvidiaModel,
        messages: [{ role: "user", content: practicePrompt(params.topic, params.sampleQuestions) }],
        max_tokens: 2048,
      },
    });
    if (!resp.ok) {
      console.error(
        `[generate-practice] NVIDIA returned ${resp.status} after ${Date.now() - startedAt}ms`,
      );
      return [];
    }
    const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? "";
    const questions = parsePracticeQuestions(content);
    console.log(`[generate-practice] ${questions.length} questions in ${Date.now() - startedAt}ms`);
    return questions;
  } catch (err) {
    console.error(
      `[generate-practice] failed after ${Date.now() - startedAt}ms: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}
