/**
 * Hector's correction card: the model may end a reply with `<correction>{"slip","fix","note"}</correction>` when the
 * learner's LAST message had one meaningful, teachable mistake. The server strips the block before the reply is
 * filtered and spoken and returns it as its own JSON field; every client runs the same parser over the assistant reply
 * as a second line of defence, so raw tag text never reaches a screen.
 *
 * Rules (shared/hector-corrections.json is replayed by the TypeScript, Swift and Kotlin ports):
 *  - Only an ASSISTANT reply is ever parsed. Learner text is shown exactly as typed (`displayText`).
 *  - Every complete block is removed from the shown text. The FIRST block is the correction (at most one per turn); a
 *    second block is stripped and ignored. If the first block is not valid, there is no correction (never the second).
 *  - Valid: JSON object, `slip` and `fix` non-empty strings, `note` an optional string; slip and fix must differ.
 *    A malformed or partial block is dropped silently: the reply is shown and nothing else happens.
 *  - An unterminated block (a reply cut off, or a stream still arriving) is removed from its `<correction` start to the
 *    end, and so is a trailing fragment of the opening tag (`<corr`), so no half tag is ever visible.
 */
export type HectorCorrection = { slip: string; fix: string; note?: string };

const OPEN = "<correction>";
const CLOSE = "</correction>";
const BLOCK = /<correction>([\s\S]*?)<\/correction>/gi;
/** Everything from an opening tag that never closed, to the end. */
const UNTERMINATED = /<correction\b[\s\S]*$/i;
const SLIP_MAX = 200;
const FIX_MAX = 200;
const NOTE_MAX = 300;

/** The longest tail of `text` that is a proper prefix of "<correction>" (at least `min` characters), or 0. */
function partialOpenLength(text: string, min: number): number {
  const lower = text.toLowerCase();
  for (const tag of [OPEN, CLOSE]) {
    for (let n = Math.min(tag.length - 1, lower.length); n >= min; n--) {
      if (tag.startsWith(lower.slice(lower.length - n))) return n;
    }
  }
  return 0;
}

/** A correction as the server returns it (or as a block parses): the same rules, so a client never trusts the wire. */
export function validateCorrection(value: unknown): HectorCorrection | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  if (typeof o.slip !== "string" || typeof o.fix !== "string") return null;
  const slip = o.slip.trim();
  const fix = o.fix.trim();
  if (!slip || !fix || slip.length > SLIP_MAX || fix.length > FIX_MAX) return null;
  if (slip.toLowerCase() === fix.toLowerCase()) return null;
  const note = typeof o.note === "string" ? o.note.trim() : "";
  if (note.length > NOTE_MAX) return null;
  return note ? { slip, fix, note } : { slip, fix };
}

function parseBlock(inner: string): HectorCorrection | null {
  try {
    return validateCorrection(JSON.parse(inner.trim()));
  } catch {
    return null;
  }
}

function strip(raw: string, minPartial: number): string {
  // An orphan closing tag (one left by a "</correction>" inside a JSON string) goes too.
  const withoutBlocks = raw.replace(BLOCK, "").replace(/<\/correction>/gi, "");
  const withoutOpen = withoutBlocks.replace(UNTERMINATED, "");
  const cut = partialOpenLength(withoutOpen, minPartial);
  return (cut > 0 ? withoutOpen.slice(0, withoutOpen.length - cut) : withoutOpen).trim();
}

/** A finished assistant reply: the text to show and speak, and the correction when there is a valid one. */
export function extractCorrection(raw: string): {
  text: string;
  correction: HectorCorrection | null;
} {
  const first = new RegExp(BLOCK.source, "i").exec(raw);
  const correction = first ? parseBlock(first[1] ?? "") : null;
  return { text: strip(raw, 2), correction };
}

/** The visible part of an assistant reply that is still arriving: never a half tag, however the chunks fall. */
export function visibleWhileStreaming(partial: string): string {
  return strip(partial, 1);
}

/** What a bubble shows: only the assistant's text is parsed; a learner's text is theirs, tags and all. */
export function displayText(role: "user" | "assistant", content: string): string {
  return role === "assistant" ? extractCorrection(content).text : content;
}

/** The instruction appended to Hector's system prompt. Additive: every other rule and the safety rules stay. */
export function correctionInstruction(language: string): string {
  return [
    "CORRECTION CARD. Converse naturally. Look only at the learner's LAST message.",
    "If, and only if, it has one meaningful, teachable mistake in grammar, word choice or phrasing,",
    "add this block after your reply, on its own line, with nothing after it:",
    `<correction>{"slip":"the shortest span of the learner's exact words that contains the mistake","fix":"the corrected version of exactly that span","note":"optional, one short encouraging sentence in ${language} on why"}</correction>`,
    `The "slip" is the SHORTEST span of the learner's exact words that contains the mistake, usually 1 to 4 words`,
    `(for "She don't like coffee": slip "don't", fix "doesn't"), never the whole sentence unless the whole sentence is the error.`,
    `The "fix" is the corrected version of exactly that span, nothing more.`,
    "Never add it for a typo (including a misspelling of a word the learner clearly knows, such as realy for really),",
    "capitalisation, punctuation, a style preference, or a message that is already correct, a greeting or a question.",
    "A misspelling of a word the learner clearly knows is a typo, so add no block for it.",
    "At most one block per reply: pick the most useful fix.",
    "THE CARD TEACHES, NOT YOUR REPLY. Your reply answers what the learner MEANT and keeps the conversation going.",
    "It may naturally use the correct form, but it must never explain the rule, point out the mistake, or quiz the learner about it:",
    "the note in the block does the teaching.",
    "Keep the tone warm and encouraging, and keep your reply itself natural.",
    "The block is removed before the learner sees your reply, so never mention it and never put anything after it.",
  ].join(" ");
}
