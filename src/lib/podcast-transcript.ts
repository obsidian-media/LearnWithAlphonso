/**
 * Transcript text handling for the podcast library (Phase 2a).
 *
 * A transcript is an **accessibility obligation**, not a feature: the
 * `<audio>` element carries no captions, so without text on screen an
 * episode is simply unavailable to deaf and hard-of-hearing learners. That
 * is why this landed before comprehension questions, XP or SRS, none of
 * which anyone is excluded by.
 *
 * Plain text only. Timed cues (a real WebVTT `<track>`) need forced
 * alignment between the text and the audio, which is a different problem
 * with different dependencies; plain text meets the obligation today and
 * does not block on it.
 */

/**
 * Upper bound on a stored transcript.
 *
 * Roughly 40 minutes of speech at a fast 150 words per minute, with room to
 * spare -- comfortably above any "short to medium-short" episode while still
 * catching a pasted book.
 */
const MAX_TRANSCRIPT_CHARS = 60_000;

/**
 * Normalizes a transcript file's text for storage, or returns null when
 * there is nothing in it.
 *
 * Trims each line, collapses runs of blank lines to a single paragraph
 * break, normalizes CRLF and CR line endings (the file is hand-written on
 * whatever platform the author uses), and strips a leading byte-order mark,
 * which survives most editors invisibly and would otherwise render as a
 * stray glyph at the start of the text.
 *
 * Throws rather than truncates when the text is too long. Silently storing
 * a partial transcript is worse than refusing one: a learner relying on it
 * has no way to know the text stops early.
 */
/**
 * A tag-like sequence: `<name ...>` or `</name>`.
 *
 * Requires a letter or slash immediately after the `<`, so ordinary prose
 * survives: "5 < 10" and "I <3 coffee" are not tags, and a transcript is
 * prose.
 */
const MARKUP = /<\/?([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^>]*)?\/?>/;

export function normalizeTranscript(raw: string): string | null {
  const markup = MARKUP.exec(raw);
  if (markup) {
    // Rejected, never stripped. This exists because a TTS script reads like
    // the obvious transcript -- the audio was generated from it -- but
    // carries SSML, and `<break time="1.0s" />` rendered on screen would
    // land on exactly the learners a transcript is for.
    //
    // Stripping would be worse than refusing: it would quietly accept the
    // wrong file, and silently rewriting someone's hand-written text is
    // surprising in its own right. The fix is a clean prose sibling of the
    // script, not a cleverer parser.
    throw new Error(
      `Transcript contains markup (found "${markup[0]}"). This looks like a TTS script ` +
        "rather than a transcript. Pass a plain-prose version instead -- markup is rejected, " +
        "not stripped, because stripping would quietly accept the wrong file.",
    );
  }

  if (raw.length > MAX_TRANSCRIPT_CHARS) {
    throw new Error(
      `Transcript is too long (${raw.length} characters, limit ${MAX_TRANSCRIPT_CHARS}). ` +
        "Refusing rather than truncating: a partial transcript looks complete to a reader.",
    );
  }

  const text = raw
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{2,}/g, "\n\n")
    .trim();

  return text.length === 0 ? null : text;
}

/**
 * Splits a stored transcript into paragraphs for rendering.
 *
 * A single newline inside a paragraph becomes a space: a hand-written file
 * is often hard-wrapped, and rendering one paragraph per source line would
 * shred it.
 */
export function transcriptParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\n/g, " ").trim())
    .filter((paragraph) => paragraph.length > 0);
}
