/**
 * Pure helpers for `/api/hector-respond` — the decoupled Hector tutor
 * (docs/superpowers/specs/2026-09-27-hector-decoupling-design.md).
 *
 * Kept separate from the route so the message-building, voice mapping and
 * reply-shaping are unit-tested directly, rather than only ever exercised
 * through a live NVIDIA/Deepgram call.
 */

import { COURSES, isCourse, type Course } from "@/data/courses";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type TutorHistoryMessage = { role: string; content: string };

/** Found in a second-opinion audit (2026-09-28): buildHectorMessages let
 * a client-supplied `history` entry claim `role: "system"` and spliced
 * it in AFTER Hector's own real system prompt below -- a prompt-injection
 * surface, since many models weight a later/additional system message
 * highly. Checked what actually needs it: TutorMemoryContext's own
 * priming message (CEFR level, open weaknesses) already uses `role:
 * "user"` (TutorMemoryContext.swift), not "system" -- so nothing
 * legitimate is lost by refusing the role entirely. */
const MAX_HISTORY_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 4000;

const CEFR_LEVELS = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);

/** "b1" becomes "B1"; anything that is not a CEFR level becomes null. Not a trust
 * boundary: a wrong level only makes Hector too easy or too hard. */
export function normalizeCefr(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  return CEFR_LEVELS.has(upper) ? upper : null;
}

/** The course a tutor turn is in. `course` is the current field; `language` is
 * what older iOS builds send ("en"). Unknown values fall back to English, which
 * is exactly the earlier behaviour. */
export function resolveTutorCourse(course: unknown, legacyLanguage: unknown): Course {
  for (const candidate of [course, legacyLanguage]) {
    if (typeof candidate !== "string") continue;
    const code = candidate.trim().toLowerCase().split("-")[0] ?? "";
    if (isCourse(code)) return code;
  }
  return "en";
}

function targetLanguage(course: Course): string {
  return COURSES.find((c) => c.id === course)?.targetLanguage ?? "English";
}

const LEVEL_GUIDANCE: Record<string, string> = {
  A1: "very simple, common words and short sentences of about 5 to 10 words",
  A2: "simple words and short, clear sentences, mostly in the present and simple past",
  B1: "everyday vocabulary and moderately complex sentences",
  B2: "natural, varied vocabulary and sentence structure",
  C1: "natural, idiomatic language without simplifying",
  C2: "natural, idiomatic language without simplifying",
};

/** Matches the Spanish content decision: Latin American Spanish. */
const VARIETY: Partial<Record<Course, string>> = {
  es: " Use Latin American Spanish: tú, usted and ustedes, never vosotros or vos.",
};

/**
 * Hector's persona for one course and level. Names the target language and the
 * level, so a French learner never gets English replies. TutorMemoryContext's
 * priming entry still carries the learner's open weaknesses inside `history`.
 */
export function buildHectorSystemPrompt(course: Course, cefr: string): string {
  const language = targetLanguage(course);
  const level = normalizeCefr(cefr);
  const levelLine = level
    ? `The learner is studying ${language} at CEFR level ${level}. Pitch every reply at ${level}: use ${LEVEL_GUIDANCE[level]}.`
    : `The learner is studying ${language}. Their level is not known yet, so start simple and adapt to how they answer.`;
  const explanationLine =
    course === "en"
      ? "If the learner asks for an explanation, keep it to one short sentence."
      : `If the learner asks for an explanation in English, give one short English sentence, then continue in ${language}.`;
  return (
    "You are Hector, a warm, patient AI language tutor inside the Learn with Alphonso app. " +
    `${levelLine} Speak only ${language}.${VARIETY[course] ?? ""} ` +
    "Hold a natural spoken conversation. Keep replies short enough to say aloud, a sentence or two, " +
    "and end with a question or prompt that keeps the learner talking. Gently correct mistakes by " +
    `modelling the right form rather than lecturing. ${explanationLine}`
  );
}

/**
 * The message list sent to the (OpenAI-compatible) NVIDIA endpoint:
 * the system persona the caller built with `buildHectorSystemPrompt` (the only system message; a client cannot
 * add another one -- see the audit note above), then up to the last
 * `MAX_HISTORY_MESSAGES` prior user/assistant turns the client passed
 * (each capped at `MAX_MESSAGE_LENGTH`), then the current user
 * utterance. Any message that isn't `user`/`assistant`, isn't a string,
 * is empty, or is too long is dropped rather than forwarded -- a bad
 * entry silently disappearing is better than it failing the upstream
 * call for the whole turn.
 */
export function buildHectorMessages(
  history: TutorHistoryMessage[],
  text: string,
  systemPrompt: string,
): ChatMessage[] {
  const priorTurns: ChatMessage[] = (Array.isArray(history) ? history : [])
    .filter(
      (m): m is ChatMessage =>
        !!m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.length > 0 &&
        m.content.length <= MAX_MESSAGE_LENGTH,
    )
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content }));

  return [
    { role: "system", content: systemPrompt },
    ...priorTurns,
    { role: "user", content: text.slice(0, MAX_MESSAGE_LENGTH) },
  ];
}

/**
 * Native Deepgram Aura-2 voice per course, from Deepgram's published voice list:
 * agathe is French (fr-fr); selena is Latin American Spanish (es-419), matching
 * the Latin American content. Never map a course to another language's voice.
 */
export const DEEPGRAM_VOICE_BY_COURSE: Readonly<Record<Course, string>> = {
  en: "aura-2-thalia-en",
  fr: "aura-2-agathe-fr",
  es: "aura-2-selena-es",
};

export function deepgramVoiceForLanguage(language: string): string {
  const code =
    typeof language === "string" ? (language.trim().toLowerCase().split("-")[0] ?? "") : "";
  return isCourse(code) ? DEEPGRAM_VOICE_BY_COURSE[code] : DEEPGRAM_VOICE_BY_COURSE.en;
}

/** The `TutorReply` shape the iOS client decodes (snake_case, exact). */
export type TutorReplyPayload = {
  request_id: string;
  session_id: string;
  agent: string;
  reply: string;
  audio_base64: string;
  tts_model: string;
  tts_provider: string;
  language: string;
  state: string;
  timings_ms: { llm: number; tts: number; total: number };
};

export function shapeTutorReply(args: {
  requestId: string;
  sessionId: string;
  agent: string;
  reply: string;
  audioBase64: string;
  ttsModel: string;
  language: string;
  llmMs: number;
  ttsMs: number;
}): TutorReplyPayload {
  return {
    request_id: args.requestId,
    session_id: args.sessionId,
    agent: args.agent,
    reply: args.reply,
    audio_base64: args.audioBase64,
    tts_model: args.ttsModel,
    tts_provider: "deepgram",
    language: args.language,
    state: "ok",
    timings_ms: {
      llm: Math.round(args.llmMs),
      tts: Math.round(args.ttsMs),
      total: Math.round(args.llmMs + args.ttsMs),
    },
  };
}
