/**
 * Bounds on a client-sent conversation before it reaches the language model. The AI quota counts calls, not tokens,
 * so every route that forwards a transcript keeps the input to a fixed size per call. Matches the tutor route's
 * per-turn and turn-count caps (src/lib/hector-conversation.ts).
 *
 * Over-long input is trimmed, not refused: the newest turns are what the model needs, and a long but honest
 * conversation keeps working.
 */
export const MAX_TRANSCRIPT_MESSAGES = 40;
export const MAX_TRANSCRIPT_MESSAGE_CHARS = 4000;
export const MAX_TRANSCRIPT_TOTAL_CHARS = 16_000;

export type TranscriptTurn = { role: "user" | "assistant"; content: string };

export function boundTranscript(raw: unknown): TranscriptTurn[] {
  if (!Array.isArray(raw)) return [];
  const turns: TranscriptTurn[] = raw
    .filter(
      (m): m is TranscriptTurn =>
        !!m &&
        typeof m === "object" &&
        ((m as TranscriptTurn).role === "user" || (m as TranscriptTurn).role === "assistant") &&
        typeof (m as TranscriptTurn).content === "string",
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_TRANSCRIPT_MESSAGE_CHARS) }))
    .slice(-MAX_TRANSCRIPT_MESSAGES);
  let size = turns.reduce((n, m) => n + m.content.length, 0);
  while (turns.length > 1 && size > MAX_TRANSCRIPT_TOTAL_CHARS) {
    size -= turns.shift()!.content.length;
  }
  return turns;
}
