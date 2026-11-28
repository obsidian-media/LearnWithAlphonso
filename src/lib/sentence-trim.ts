/**
 * Keeps a spoken reply under a character limit by cutting at a sentence boundary, never mid-sentence. Text already
 * within the limit is returned untouched. The first sentence is kept even if it alone is over the limit, cut at the last
 * space (then the limit is the limit, but a half word is never spoken). Used for Hector's rehearsal replies, whose
 * longer debrief must fit one /api/tts request (TTS_MAX_CHARS), so what is shown is exactly what is spoken.
 */
export function trimToSentences(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  // Sentence ends: . ! ? … (and the Spanish/French marks that close with the same ones), followed by a space or the end.
  const ends = [...t.matchAll(/[.!?…]+["')\]»”]*(?=\s|$)/g)].map((m) => m.index! + m[0].length);
  let cut = 0;
  for (const e of ends) if (e <= max) cut = e;
  if (cut > 0) return t.slice(0, cut).trim();
  const head = t.slice(0, max);
  const space = head.lastIndexOf(" ");
  return (space > 0 ? head.slice(0, space) : head).trim();
}
