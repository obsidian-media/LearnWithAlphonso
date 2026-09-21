import { z } from "zod";

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
 */
export async function generatePracticeQuestions(params: {
  topic: string;
  sampleQuestions: { prompt: string; answer: string }[];
  nvidiaApiKey: string;
  nvidiaModel: string;
}): Promise<GeneratedPracticeQuestion[]> {
  if (params.sampleQuestions.length === 0) return [];
  try {
    const resp = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.nvidiaApiKey}`,
      },
      body: JSON.stringify({
        model: params.nvidiaModel,
        messages: [{ role: "user", content: practicePrompt(params.topic, params.sampleQuestions) }],
      }),
    });
    if (!resp.ok) return [];
    const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? "";
    return parsePracticeQuestions(content);
  } catch {
    return [];
  }
}
