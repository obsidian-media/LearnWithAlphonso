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
export function normalizeTranscript(raw: string): string | null {
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
