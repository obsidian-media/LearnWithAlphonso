/**
 * The verdict on the learner's last turn, carried with a Practice reply so the talking avatar can react.
 *
 * How it is produced: the model is asked to end its reply with a tag line, `[[verdict:correct]]`. The server parses
 * the tag and strips it, so the text that is shown and spoken never contains it. The verdict is its own JSON field,
 * which shipped clients (iOS builds 56-58, Android) never read: they decode `content` only.
 *
 * The rule for every doubt is "none": a missing tag, an unknown word, two different tags, or a tag that is not the
 * last thing in the reply all give "none", and no tag-shaped text ever reaches the learner.
 */
export type ReplyVerdict = "correct" | "corrected" | "none";

export const REPLY_VERDICTS: readonly ReplyVerdict[] = ["correct", "corrected", "none"];

/** Appended to the persona's system prompt (before the safety rules, which stay last). */
export const REPLY_VERDICT_INSTRUCTION = [
  "VERDICT TAG. After your reply to the learner, add one final line holding exactly one tag and nothing else:",
  "[[verdict:correct]] if the learner's last message was correct and natural,",
  "[[verdict:corrected]] if it had a mistake that you corrected or rephrased in your reply,",
  "[[verdict:none]] if it was a greeting, a question, off topic, or you cannot tell.",
  "The tag is removed before the learner sees your reply, so never mention it and never put anything after it.",
].join("\n");

export function withVerdictInstruction(systemPrompt: string): string {
  return `${systemPrompt.trimEnd()}\n\n${REPLY_VERDICT_INSTRUCTION}`;
}

const TAG = /\[\[\s*verdict\s*:\s*([A-Za-z]*)\s*\]\]/gi;
/** A tag the model started and did not finish (a reply cut off by the token cap), or a stray opener. */
const DANGLING = /\[\[\s*v[a-z]*\s*:?\s*[A-Za-z]*\s*\]?$/i;

export function splitReplyVerdict(raw: string): { text: string; verdict: ReplyVerdict } {
  const found: string[] = [];
  let tagAtEnd = false;
  const withoutTags = raw.replace(TAG, (match: string, word: string, offset: number) => {
    found.push(word.toLowerCase());
    if (raw.slice(offset + match.length).trim() === "") tagAtEnd = true;
    return "";
  });
  const text = withoutTags.replace(DANGLING, "").trim();
  const distinct = new Set(found);
  const only = distinct.size === 1 ? [...distinct][0] : undefined;
  const verdict: ReplyVerdict =
    tagAtEnd && only !== undefined && (REPLY_VERDICTS as readonly string[]).includes(only)
      ? (only as ReplyVerdict)
      : "none";
  return { text, verdict };
}
