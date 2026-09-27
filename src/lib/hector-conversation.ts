/**
 * Pure helpers for `/api/hector-respond` — the decoupled Hector tutor
 * (docs/superpowers/specs/2026-09-27-hector-decoupling-design.md).
 *
 * Kept separate from the route so the message-building, voice mapping and
 * reply-shaping are unit-tested directly, rather than only ever exercised
 * through a live NVIDIA/Deepgram call.
 */

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type TutorHistoryMessage = { role: string; content: string };

/**
 * Hector's persona. Deliberately short: the learner-specific context
 * (CEFR level, open weaknesses) arrives inside `history` as a priming
 * entry the CLIENT builds (TutorMemoryContext), so it must not be
 * duplicated or contradicted here.
 */
export const HECTOR_SYSTEM_PROMPT =
  "You are Hector, a warm, patient AI language tutor inside the Learn with " +
  "Alphonso app. Hold a natural spoken conversation at the learner's level. " +
  "Keep replies short enough to say aloud — a sentence or two — and end with " +
  "a question or prompt that keeps the learner talking. Gently correct " +
  "mistakes by modelling the right form rather than lecturing. Reply in the " +
  "learner's target language unless they ask for an explanation in English.";

/**
 * The message list sent to the (OpenAI-compatible) NVIDIA endpoint:
 * system persona, then the prior turns the client passed, then the
 * current user utterance. Only `system`/`user`/`assistant` roles survive
 * — anything else is dropped rather than forwarded to the model, since a
 * bad role fails the upstream call for the whole turn.
 */
export function buildHectorMessages(history: TutorHistoryMessage[], text: string): ChatMessage[] {
  const priorTurns: ChatMessage[] = (Array.isArray(history) ? history : [])
    .filter(
      (m): m is ChatMessage =>
        !!m &&
        (m.role === "system" || m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.length > 0,
    )
    .map((m) => ({ role: m.role, content: m.content }));

  return [
    { role: "system", content: HECTOR_SYSTEM_PROMPT },
    ...priorTurns,
    { role: "user", content: text },
  ];
}

/**
 * Deepgram TTS voice for the learner's language. Cloud Voice used piper
 * voices ("mana"); Deepgram doesn't have those, and the client only plays
 * the returned audio — it never inspects the voice name — so mapping to a
 * Deepgram Aura voice is transparent to it. English gets a settled default;
 * other languages fall back to it until a per-language voice is chosen,
 * which is a copy change here, not a client change.
 */
export function deepgramVoiceForLanguage(language: string): string {
  const map: Record<string, string> = {
    en: "aura-2-thalia-en",
    fr: "aura-2-pandora-en", // placeholder until a FR voice is settled
    es: "aura-2-celeste-es",
  };
  return map[language?.toLowerCase?.() ?? "en"] ?? "aura-2-thalia-en";
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
