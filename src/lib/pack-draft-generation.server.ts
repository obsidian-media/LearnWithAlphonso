import { z } from "zod";

/**
 * V4 #5 "content authoring tooling": AI-assisted first-draft generation for
 * a full lesson-bank Pack (title/subtitle/note/data lines), not just
 * ephemeral practice questions. Same NVIDIA NIM integration and defensive-
 * parse posture as `practice-generation.server.ts` / `weakness-detection.
 * server.ts` (no structured-output mode is used anywhere in this codebase,
 * so never assume clean JSON from the model).
 *
 * This is explicitly a DRAFT step, not an authoring shortcut that ships
 * content directly: `scripts/pack-tool.ts draft` writes the result to a
 * file for a human to read, edit, and re-validate -- it never touches a
 * real lesson-bank-*.ts file itself. `.server.ts` suffix kept for the same
 * reason every other NVIDIA-key-touching module in this codebase uses it:
 * a hard guard against ever being pulled into a client bundle, even though
 * today's only caller is the CLI script, not a route.
 */
const draftPackSchema = z.object({
  title: z.string().min(1).max(80),
  subtitle: z.string().min(1).max(120),
  note: z.string().min(1).max(200),
  lines: z.array(z.string().min(1).max(200)).min(3).max(30),
});
export type DraftPackResult = z.infer<typeof draftPackSchema>;

/** Never throws -- any parse/shape failure yields null so callers fail loudly with a clear message. */
export function parseDraftPack(content: string): DraftPackResult | null {
  const stripped = content.replace(/```json\s*|```\s*/g, "").trim();
  try {
    const parsed: unknown = JSON.parse(stripped);
    const result = draftPackSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function draftPackPrompt(params: {
  topic: string;
  targetLanguage: string;
  kind: "pair" | "cloze";
  lineCount: number;
}): string {
  const { topic, targetLanguage, kind, lineCount } = params;
  const shape =
    kind === "pair"
      ? `each line as "<English phrase>|<${targetLanguage} translation>"`
      : `each line as "<English sentence with one blank written as ___>|<the single ${targetLanguage} word or short phrase that fills the blank>"`;
  return (
    `Write vocabulary/grammar content for a ${targetLanguage} lesson pack on the topic: "${topic}". ` +
    `Produce exactly ${lineCount} lines, ${shape}. No duplicate left sides. Interface language is ` +
    `English throughout (the learner is an English speaker learning ${targetLanguage}), so every ` +
    `left side must be plain English and every right side must be natural, correct ${targetLanguage}. ` +
    `Respond with ONLY a JSON object, no other text, in this exact shape: {"title": "<short pack title, ` +
    `e.g. 'Weather & Seasons'>", "subtitle": "<short subtitle>", "note": "<one-sentence grammar/usage note ` +
    `shown as an explanation suffix>", "lines": ["<line 1>", "<line 2>", ...]}. If you can't produce good ` +
    `content for this topic, respond with {"title": "", "subtitle": "", "note": "", "lines": []}.`
  );
}

/**
 * Calls NVIDIA NIM to draft a pack's title/subtitle/note/data lines for a
 * given topic. Throws on any failure (missing key, upstream error, bad
 * shape) rather than failing quiet -- unlike the ephemeral in-app practice-
 * question generator this backs an offline authoring tool with a human at
 * the keyboard who needs to know *why* a draft didn't come back, not a
 * live user-facing feature that should degrade silently.
 */
export async function draftPack(params: {
  topic: string;
  targetLanguage: string;
  kind: "pair" | "cloze";
  lineCount: number;
  nvidiaApiKey: string;
  nvidiaModel: string;
}): Promise<DraftPackResult> {
  const resp = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.nvidiaApiKey}`,
    },
    body: JSON.stringify({
      model: params.nvidiaModel,
      messages: [{ role: "user", content: draftPackPrompt(params) }],
    }),
  });
  if (!resp.ok) {
    throw new Error(`NVIDIA NIM request failed: ${resp.status} ${resp.statusText}`);
  }
  const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "";
  const parsed = parseDraftPack(content);
  if (!parsed || parsed.lines.length === 0) {
    throw new Error(
      `model response did not parse into a usable draft. Raw content:\n${content || "(empty)"}`,
    );
  }
  return parsed;
}
