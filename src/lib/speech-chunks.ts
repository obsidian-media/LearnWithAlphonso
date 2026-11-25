/**
 * Splits a spoken reply so the first sentence can be made and played while the rest is still being made. Both the
 * web client and /api/tts split with this one function, so a part index means the same text on both sides and the
 * client never sends the text of a part: the server derives it from the text the turn token vouches for.
 *
 * At most two parts: the first sentence, and everything after it. More parts would add a request each (and a gap
 * between them) for no gain once the first sentence is playing.
 */
const MIN_FIRST_CHARS = 12;
const MAX_FIRST_CHARS = 220;

export function splitReplyForSpeech(text: string): string[] {
  const t = text.trim();
  // A sentence ends at . ! ? … (and the Spanish/French equivalents end the same way) followed by a space.
  const re = /[.!?…]+["')\]»”]*\s+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const end = m.index + m[0].length;
    const first = t.slice(0, end).trim();
    const rest = t.slice(end).trim();
    if (first.length >= MIN_FIRST_CHARS && first.length <= MAX_FIRST_CHARS && rest.length > 0) {
      return [first, rest];
    }
    // A too-short opener ("Oui. ") joins the next sentence; a too-long one means no early split at all.
    if (first.length > MAX_FIRST_CHARS) break;
  }
  return [t];
}
