/**
 * Splits a long episode script into Deepgram-sized pieces.
 *
 * src/routes/api/tts.ts caps each request at 2000 characters; a 6-8
 * minute episode is roughly 7000, so a podcast script must be chunked
 * and the resulting audio joined. Splitting on sentence boundaries keeps
 * prosody intact -- a mid-word split is audible.
 */
const DEEPGRAM_CHARACTER_LIMIT = 2000;

/** Last resort for a "sentence" with no boundary inside the limit. */
function hardSplit(sentence: string, limit: number): string[] {
  const pieces: string[] = [];
  for (let i = 0; i < sentence.length; i += limit) {
    pieces.push(sentence.slice(i, i + limit));
  }
  return pieces;
}

export function chunkScript(text: string, limit = DEEPGRAM_CHARACTER_LIMIT): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const sentences =
    trimmed
      .match(/[^.!?]+[.!?]*\s*/g)
      ?.map((sentence) => sentence.trim())
      .filter(Boolean) ?? [];

  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    // A single sentence over the limit has no boundary to split on.
    // Hard-split it rather than emit an oversized chunk: Deepgram
    // truncates silently, so the audio would just go missing with no
    // error anywhere to notice.
    if (sentence.length > limit) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      chunks.push(...hardSplit(sentence, limit));
      continue;
    }
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > limit) {
      chunks.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
