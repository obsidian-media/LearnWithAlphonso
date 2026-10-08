import { z } from "zod";
import { nvidiaChatCompletion } from "./nvidia-chat.server";
import { normalizePracticeQuestion, type PracticeQuestion } from "./practice-choices";

/** Two short attempts instead of one long call: the learner gets an answer in about 20 s at worst. */
export const PRACTICE_ATTEMPT_TIMEOUT_MS = 8_000;
export const PRACTICE_MAX_ATTEMPTS = 2;

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
    return result.success
      ? result.data.map(normalizePracticeQuestion).filter((q): q is PracticeQuestion => q !== null)
      : [];
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
    `Write exactly 3 NEW multiple-choice questions, each with 4 different choices, testing the exact same topic and ` +
    `similar difficulty, but with different content -- never repeat the examples ` +
    `above verbatim. Respond with ONLY a JSON array, no other text, in this exact ` +
    `shape: [{"prompt": "<question text>", "choices": ["<4 options>"], ` +
    `"answerIndex": <0-3>, "explanation": "<why>"}]. If you can't write good ` +
    `questions for this topic, respond with [].`
  );
}

/**
 * Calls NVIDIA NIM with `practicePrompt` and parses the result. Never throws: any upstream or parse failure
 * just yields an empty array, matching analyze-weaknesses' fail-quiet design (this is a nice-to-have layered on
 * top of the real lesson, not a trust boundary itself). The route turns an empty result into a deterministic
 * fallback set. `durationMs` is logged on every outcome so a recurrence gives an exact number.
 *
 * 1200 tokens comfortably fits exactly 3 questions; two 8 s attempts replace one 20 s call. A retry runs only
 * after a failure or an empty parse.
 */
export async function generatePracticeQuestions(params: {
  topic: string;
  sampleQuestions: { prompt: string; answer: string }[];
  nvidiaApiKey: string;
  nvidiaModel: string;
}): Promise<GeneratedPracticeQuestion[]> {
  if (params.sampleQuestions.length === 0) return [];
  for (let attempt = 1; attempt <= PRACTICE_MAX_ATTEMPTS; attempt++) {
    const startedAt = Date.now();
    try {
      const resp = await nvidiaChatCompletion({
        apiKey: params.nvidiaApiKey,
        signal: AbortSignal.timeout(PRACTICE_ATTEMPT_TIMEOUT_MS),
        body: {
          model: params.nvidiaModel,
          messages: [{ role: "user", content: practicePrompt(params.topic, params.sampleQuestions) }],
          max_tokens: 1200,
        },
      });
      if (!resp.ok) {
        console.error(
          `[generate-practice] attempt ${attempt}: NVIDIA ${resp.status} after ${Date.now() - startedAt}ms`,
        );
        continue;
      }
      const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
      const questions = parsePracticeQuestions(data.choices?.[0]?.message?.content ?? "");
      console.log(
        `[generate-practice] attempt ${attempt}: ${questions.length} questions in ${Date.now() - startedAt}ms`,
      );
      if (questions.length > 0) return questions;
    } catch (err) {
      console.error(
        `[generate-practice] attempt ${attempt} failed after ${Date.now() - startedAt}ms: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return [];
}
