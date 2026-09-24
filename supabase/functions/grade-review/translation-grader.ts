// Deno copy of src/lib/translation-grader.server.ts. Same bundling reason as
// the other ports here, and the same contract: `null` means "no usable AI
// opinion", never "wrong". The caller keeps its local verdict.
//
// This copy exists so a review item reaches the SAME verdict the player showed.
// Without it, a phrasing the player accepted would be re-derived here by string
// comparison alone, and the learner would be congratulated and have the item
// lapsed in the same breath.

export type AiTranslationVerdict = { correct: boolean; reason: string | null };

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
