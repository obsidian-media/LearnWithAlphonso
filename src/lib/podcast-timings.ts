/**
 * Timed transcript lines: one start time per sentence, produced offline by aligning an episode's existing transcript
 * to its audio (docs/PODCAST-TIMINGS.md). The text is never re-transcribed: the lines are the stored transcript cut
 * into sentences, so a line's text is always the transcript's own words.
 */
export type TimedLine = {
  /** Start, in seconds from the beginning of the audio. */
  s: number;
  /** The sentence, exactly as it appears in the transcript. */
  t: string;
  /** True when this sentence opens a paragraph. */
  p: boolean;
};

export type TimingEntry = { lines: TimedLine[] };

/**
 * The line being spoken at `seconds`: the last line whose start is at or before it. Before the first start (or for a
 * non-finite time) it is the first line; with no lines it is -1. Binary search, because it runs on every time update.
 */
export function activeLineIndex(lines: readonly TimedLine[], seconds: number): number {
  if (lines.length === 0) return -1;
  const t = Number.isFinite(seconds) ? seconds : 0;
  let lo = 0;
  let hi = lines.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lines[mid]!.s <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

const squash = (s: string) => s.replace(/\s+/g, "");

/**
 * The entry's lines, only if they still spell the transcript word for word (whitespace aside) and the starts never
 * go backwards. Anything else returns null and the player shows the plain transcript, so an episode whose text was
 * edited after alignment can never highlight the wrong words.
 */
export function timedLinesFor(
  entry: TimingEntry | undefined,
  transcript: string | null,
): TimedLine[] | null {
  if (!entry || !transcript || entry.lines.length === 0) return null;
  for (let i = 1; i < entry.lines.length; i++) {
    if (entry.lines[i]!.s < entry.lines[i - 1]!.s) return null;
  }
  const joined = entry.lines.map((l) => squash(l.t)).join("");
  return joined === squash(transcript) ? entry.lines : null;
}
