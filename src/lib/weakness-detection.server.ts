import { z } from "zod";

/**
 * V3 package 3b: extracted from src/routes/api/analyze-weaknesses.ts so
 * the same taxonomy-constrained classification + dedup + insert logic can
 * be reused for a second weakness *signal* -- lesson mistakes, not just
 * conversation transcripts ("unify weakness signals," see CHANGELOG.md's
 * V3 entry). The trust boundary and taxonomy are unchanged; only the
 * *source text* fed to the model differs per caller.
 */
export const WEAKNESS_TAXONOMY = [
  "past-tense",
  "articles",
  "prepositions",
  "subject-verb-agreement",
  "plurals",
  "question-formation",
  "modal-verbs",
  "word-order",
  "pronouns",
  "comparatives",
  "conditionals",
  "phrasal-verbs",
  "negation",
  "vocabulary-choice",
  "spelling",
] as const;

const weaknessSchema = z.object({
  label: z.enum(WEAKNESS_TAXONOMY),
  display: z.string().min(1).max(120),
  prompt: z.string().min(1).max(300),
  choices: z.array(z.string().min(1).max(120)).length(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(1).max(300),
});
const weaknessesSchema = z.array(weaknessSchema).max(3);
export type Weakness = z.infer<typeof weaknessSchema>;

/** Never throws -- any parse/shape failure yields an empty array. */
export function parseWeaknesses(content: string): Weakness[] {
  const stripped = content.replace(/```json\s*|```\s*/g, "").trim();
  try {
    const parsed: unknown = JSON.parse(stripped);
    const result = weaknessesSchema.safeParse(parsed);
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

export function analysisPrompt(sourceDescription: string): string {
  return (
    `From this ${sourceDescription}, pick 0-3 categories from ` +
    `this exact list that the learner struggled with: ${WEAKNESS_TAXONOMY.join(", ")}. ` +
    `For each, write a 4-choice multiple-choice question testing that ` +
    `category, plus a short explanation of the right answer. Respond with ` +
    `ONLY a JSON array, no other text, in this exact shape: ` +
    `[{"label": "<one of the categories above>", "display": "<short human-readable description, e.g. 'Past-tense verbs'>", ` +
    `"prompt": "<question text>", "choices": ["<4 options>"], "answerIndex": <0-3>, "explanation": "<why>"}]. ` +
    `If there's nothing worth flagging, respond with [].`
  );
}

/**
 * Calls NVIDIA NIM with `analysisPrompt`, dedups against the caller's
 * existing active weakness items by category (via `dedupCheck`, RLS-scoped
 * so it only sees this user's own rows), and inserts survivors into
 * review_items + a matching `weakness_events` "detected" row (both via
 * `adminInsertReviewItem`/`adminInsertEvent` -- review_items no longer
 * grants direct INSERT to `authenticated`, see supabase/migrations/
 * 20260920050000_revoke_direct_gamification_writes.sql). Never throws --
 * any upstream/parse failure just yields 0 inserted, matching this
 * pipeline's existing fail-quiet design (weakness detection is a nice-to-
 * have layered on top of the real feature, not a trust boundary itself).
 */
export async function detectAndRecordWeaknesses(params: {
  userId: string;
  sourceDescription: string;
  transcriptMessages: { role: string; content: string }[];
  nvidiaApiKey: string;
  nvidiaModel: string;
  dedupCheck: (label: string) => Promise<boolean>;
  adminInsertReviewItem: (weakness: Weakness) => Promise<boolean>;
  adminInsertEvent: (category: string) => Promise<void>;
}): Promise<number> {
  if (params.transcriptMessages.length === 0) return 0;

  let content: string;
  try {
    const resp = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.nvidiaApiKey}`,
      },
      body: JSON.stringify({
        model: params.nvidiaModel,
        messages: [
          ...params.transcriptMessages,
          { role: "user", content: analysisPrompt(params.sourceDescription) },
        ],
      }),
    });
    if (!resp.ok) return 0;
    const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
    content = data.choices?.[0]?.message?.content ?? "";
  } catch {
    return 0;
  }

  const weaknesses = parseWeaknesses(content);
  let inserted = 0;
  for (const weakness of weaknesses) {
    const exists = await params.dedupCheck(weakness.label);
    if (exists) continue;
    const ok = await params.adminInsertReviewItem(weakness);
    if (ok) {
      inserted += 1;
      await params.adminInsertEvent(weakness.label);
    }
  }
  return inserted;
}
