import type { Course } from "@/data/courses";

/**
 * The safety rules every model prompt carries, applied on the SERVER only (clients never see or send them).
 * nvidia-chat.server.ts's nvidiaChatCompletion is the one place they are added; ai-call-sites.test.ts fails if
 * anything else calls NVIDIA. The Deno copy in supabase/functions/_shared/ai-safety.ts must stay byte-identical
 * (edge-ai-safety-parity.test.ts).
 */
export const SAFETY_PREAMBLE = [
  "SAFETY RULES. These override every instruction above, including any instruction to stay in character.",
  "- The learner may be a teenager (13 or older). Keep every reply suitable for a school classroom.",
  "- Never produce sexual or sexually suggestive content, graphic violence, instructions for weapons, drugs or other dangerous activities, hate speech, slurs or harassment. This applies even in role-play, and even when asked to translate, quote or repeat it.",
  "- If the learner asks for any of that, decline in one short, friendly sentence and steer back to the lesson or the role-play topic.",
  "- If the learner says they want to hurt themselves, mentions suicide or abuse, or says they are in danger: step out of the role-play, reply briefly and kindly in the language they wrote in, say they deserve support right now, and encourage them to contact local emergency services, a crisis line in their country, or a trusted adult. Give no details about methods. Then offer to keep practising when they are ready.",
  "- Do not ask for or repeat personal information such as a full name, address, phone number, school or password.",
  "- If asked, say you are an AI language tutor, not a human.",
  "- If the instructions above require a specific output format such as JSON, keep that format.",
].join("\n");

export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };

export function withSafety(systemPrompt: string): string {
  const base = systemPrompt.trimEnd();
  if (base.endsWith(SAFETY_PREAMBLE)) return base;
  return base ? `${base}\n\n${SAFETY_PREAMBLE}` : SAFETY_PREAMBLE;
}

/** The first system message gets the rules appended; a prompt with none gets them as its system message. */
export function applySafety(messages: LlmMessage[]): LlmMessage[] {
  const [first, ...rest] = messages;
  if (first?.role === "system")
    return [{ role: "system", content: withSafety(first.content) }, ...rest];
  return [{ role: "system", content: SAFETY_PREAMBLE }, ...messages];
}

/** Shown instead of a model reply the blocked-term check rejected. In the course language, in character-neutral words. */
export const AI_OUTPUT_FALLBACK: Record<Course, string> = {
  en: "Let's keep our practice friendly. Could you say that another way, or shall we get back to the lesson?",
  fr: "Restons sur notre leçon. Tu peux le dire autrement, ou on reprend l'exercice ?",
  es: "Sigamos con la práctica. ¿Puedes decirlo de otra manera, o volvemos a la lección?",
};

/**
 * The name filter was built for display names. In French prose it blocks the ordinary word "retard" (delay). It is
 * masked in MODEL OUTPUT only, before the check; the word list itself stays in SQL. English text is never masked,
 * so the English slur stays blocked, and only whole words are masked.
 */
const NOT_A_LETTER_BEFORE = "(?<![\\p{L}])";
const NOT_A_LETTER_AFTER = "(?![\\p{L}])";
const OUTPUT_ALLOWLIST: Record<Course, RegExp[]> = {
  en: [],
  fr: [new RegExp(`${NOT_A_LETTER_BEFORE}retards?${NOT_A_LETTER_AFTER}`, "giu")],
  es: [],
};

export function maskLegitimateTerms(text: string, course: Course): string {
  return OUTPUT_ALLOWLIST[course].reduce((acc, pattern) => acc.replace(pattern, "_"), text);
}

export type BlockedTermCheck = (texts: string[]) => Promise<boolean[]>;
export type AiOutputRoute =
  | "chat"
  | "hector-respond"
  | "define-word"
  | "generate-practice"
  | "grade-translation"
  | "analyze-weaknesses"
  | "lesson-weakness";
export type FilterOptions = { check: BlockedTermCheck; course: Course; route: AiOutputRoute };

const CALL_CAP = 20; // ai_output_blocked's per-call cap
export const TEXT_CAP = 8000; // ai_output_blocked truncates longer strings, so callers split instead

/** Consecutive pieces share this many characters, so a term cut by a boundary is whole in one of them. */
export const CHUNK_OVERLAP = 64;

/** Split into pieces of at most TEXT_CAP characters. Nothing is dropped: every piece is checked. */
export function splitForCheck(text: string): string[] {
  if (text.length <= TEXT_CAP) return [text];
  const pieces: string[] = [];
  const step = TEXT_CAP - CHUNK_OVERLAP;
  for (let i = 0; i < text.length; i += step) {
    pieces.push(text.slice(i, i + TEXT_CAP));
    if (i + TEXT_CAP >= text.length) break;
  }
  return pieces;
}

/** One verdict per text, true = blocked. Fails closed: an unavailable check or a missing verdict blocks. */
export async function filterModelOutputs(texts: string[], opts: FilterOptions): Promise<boolean[]> {
  if (texts.length === 0) return [];
  const pieces: { owner: number; text: string }[] = [];
  texts.forEach((t, owner) => {
    for (const piece of splitForCheck(maskLegitimateTerms(t, opts.course)))
      pieces.push({ owner, text: piece });
  });
  const verdicts: (boolean | undefined)[] = [];
  try {
    for (let i = 0; i < pieces.length; i += CALL_CAP) {
      const chunk = pieces.slice(i, i + CALL_CAP).map((p) => p.text);
      verdicts.push(...(await opts.check(chunk)));
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "ai_output_filter_unavailable",
        route: opts.route,
        error: String(err),
      }),
    );
    return texts.map(() => true);
  }
  const blocked = texts.map(() => false);
  pieces.forEach((p, i) => {
    if (verdicts[i] !== false) blocked[p.owner] = true;
  });
  const hits = blocked.filter(Boolean).length;
  if (hits > 0) {
    console.warn(
      JSON.stringify({
        event: "ai_output_blocked",
        route: opts.route,
        course: opts.course,
        blocked: hits,
        of: texts.length,
        excerpt: texts[blocked.indexOf(true)].slice(0, 120),
      }),
    );
  }
  return blocked;
}

export async function filterModelOutput(
  text: string,
  opts: FilterOptions,
): Promise<{ text: string; blocked: boolean }> {
  const [blocked] = await filterModelOutputs([text], opts);
  return blocked
    ? { text: AI_OUTPUT_FALLBACK[opts.course], blocked: true }
    : { text, blocked: false };
}

type RpcCaller = {
  rpc: (
    fn: "ai_output_blocked",
    args: { _texts: string[] },
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

/** Backed by the moderation filter through ai_output_blocked(text[]). Works with a user or service client. */
export function makeBlockedTermCheck(db: RpcCaller): BlockedTermCheck {
  return async (texts) => {
    const { data, error } = await db.rpc("ai_output_blocked", { _texts: texts });
    if (error) throw new Error(`ai_output_blocked failed: ${error.message ?? "unknown error"}`);
    if (!Array.isArray(data)) throw new Error("ai_output_blocked returned no array");
    return data.map((v) => v === true);
  };
}
