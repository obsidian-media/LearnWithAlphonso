/**
 * The AI half of translate grading: asked only about submissions the curated
 * `acceptableAnswers` list has already rejected.
 *
 * The contract that matters is the return type. `null` means **no usable AI
 * opinion** -- the vendor was down, the key is missing, the model rambled --
 * and the caller keeps its local verdict. It never means "wrong". Every failure
 * path here returns `null` and this function never rejects, because a rejection
 * at the call site would surface to the learner as a wrong answer for a phrase
 * they may well have written correctly.
 *
 * Mirrored for Deno in supabase/functions/grade-review/translation-grader.ts,
 * so review items reach the same verdict the player showed.
 */

export type AiTranslationVerdict = { correct: boolean; reason: string | null };

/** Kept short: it is sent on every fallback call, and the model only has to
 *  answer one question. Asking for bare JSON rather than prose is what makes
 *  the parse below strict enough to be safe. */
function gradingPrompt(args: {
  prompt: string;
  acceptableAnswers: string[];
  submission: string;
}): string {
  return [
    "You are marking one answer in a beginner English course. Be generous about",
    "wording and strict about meaning: a different but natural way of expressing",
    "the same idea is CORRECT. Spelling slips are correct if the intent is clear.",
    "A sentence that means something else, or is not English, is incorrect.",
    "",
    `The learner was asked to: ${args.prompt}`,
    `Wordings already known to be correct: ${args.acceptableAnswers.join(" / ")}`,
    `The learner wrote: ${args.submission}`,
    "",
    'Reply with ONLY this JSON and nothing else: {"correct": true or false,',
    '"reason": "one short sentence for the learner"}',
  ].join("\n");
}

/**
 * Pulls the verdict out of whatever the model actually said.
 *
 * Models wrap JSON in prose and fences however they feel that day, so this
 * takes the first balanced-looking object in the text rather than assuming the
 * whole response is JSON. Anything it cannot read with a boolean `correct`
 * becomes `null`: an unparseable answer is no answer.
 */
function parseVerdict(content: string): AiTranslationVerdict | null {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const parsed = JSON.parse(content.slice(start, end + 1)) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const { correct, reason } = parsed as { correct?: unknown; reason?: unknown };
    if (typeof correct !== "boolean") return null;
    return { correct, reason: typeof reason === "string" && reason.trim() ? reason.trim() : null };
  } catch {
    return null;
  }
}

export async function gradeTranslationWithAi(args: {
  prompt: string;
  acceptableAnswers: string[];
  submission: string;
  apiKey: string;
  model: string;
}): Promise<AiTranslationVerdict | null> {
  try {
    const resp = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${args.apiKey}`,
      },
      body: JSON.stringify({
        model: args.model,
        // Deterministic marking: the same answer should not be correct on one
        // attempt and wrong on the next.
        temperature: 0,
        messages: [
          {
            role: "user",
            content: gradingPrompt({
              prompt: args.prompt,
              acceptableAnswers: args.acceptableAnswers,
              submission: args.submission,
            }),
          },
        ],
      }),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
    return parseVerdict(data.choices?.[0]?.message?.content ?? "");
  } catch {
    return null;
  }
}
