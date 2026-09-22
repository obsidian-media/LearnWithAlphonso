import type { VocabEntry } from "../data/generative/vocab";

/**
 * Unions a batch of newly-accepted vocab candidates into an existing
 * array. Entries are keyed by (word, pos) -- word compared
 * case-insensitively, since "Coffee" and "coffee" are the same
 * vocabulary item. A candidate matching an existing entry has its
 * `topics` merged (deduplicated, existing topics first) into that
 * entry rather than creating a duplicate row; a genuinely new
 * (word, pos) pair is appended. Never mutates its inputs.
 */
export function mergeVocabEntries(existing: VocabEntry[], candidates: VocabEntry[]): VocabEntry[] {
  const result = existing.map((e) => ({ ...e, topics: [...e.topics] }));
  for (const candidate of candidates) {
    const match = result.find(
      (e) => e.word.toLowerCase() === candidate.word.toLowerCase() && e.pos === candidate.pos,
    );
    if (match) {
      for (const topic of candidate.topics) {
        if (!match.topics.includes(topic)) match.topics.push(topic);
      }
      continue;
    }
    result.push({ ...candidate, topics: [...candidate.topics] });
  }
  return result;
}

function tsString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Formats one VocabEntry as the TS object-literal source used inside
 *  vocab.ts's GENERATIVE_VOCAB array (2-space indent, trailing comma) --
 *  same convention as pack-authoring.ts's formatPackAsTs. */
export function formatVocabEntryAsTs(entry: VocabEntry): string {
  const lines = [
    "  {",
    `    word: ${tsString(entry.word)},`,
    `    pos: ${tsString(entry.pos)},`,
    `    level: ${tsString(entry.level)},`,
  ];
  lines.push(`    topics: [${entry.topics.map(tsString).join(", ")}],`);
  lines.push("  },");
  return lines.join("\n");
}

/**
 * Splices a freshly-serialized entries array into vocab.ts's source,
 * replacing everything between `export const GENERATIVE_VOCAB:
 * VocabEntry[] = [` and its matching closing `]` -- mirrors
 * pack-authoring.ts's insertPackIntoBank marker-splice pattern, but
 * replaces the WHOLE array body each time (not just appends one entry)
 * since the caller already has the complete desired array in memory
 * from mergeVocabEntries. This is what lets a repeated proposal's
 * merged topics show up correctly without surgical per-entry editing.
 * Never touches the file's header/type/comment above the marker.
 *
 * Finds the matching `]` by counting bracket depth from the opening
 * `[`, rather than searching for a literal `"\n];"` string -- a real
 * end-to-end CLI run (2026-09-22) found the committed vocab.ts collapses
 * an empty array onto one line (`= [];`), which a literal `"\n];"`
 * search can't find. Bracket counting handles that format and a
 * multi-line one identically, and also handles a VocabEntry whose own
 * `topics` field is itself a nested `[...]` array. It does not account
 * for a literal `[`/`]` character inside a string value (a word or
 * topic containing a bracket) -- not expected for real vocabulary
 * content, and out of scope for this pilot.
 */
export function replaceVocabArrayInSource(fileSource: string, entries: VocabEntry[]): string {
  const startMarker = "export const GENERATIVE_VOCAB: VocabEntry[] = [";
  const start = fileSource.indexOf(startMarker);
  if (start === -1) {
    throw new Error(`could not find "${startMarker}" in the vocab file source.`);
  }
  const arrayStart = start + startMarker.length; // just after the opening "["

  let depth = 1;
  let i = arrayStart;
  for (; i < fileSource.length && depth > 0; i++) {
    if (fileSource[i] === "[") depth++;
    else if (fileSource[i] === "]") depth--;
  }
  if (depth !== 0) {
    throw new Error(`found "${startMarker}" but no matching "]" after it.`);
  }
  const closeBracketIdx = i - 1; // index of the matching "]"

  const body = entries.length > 0 ? "\n" + entries.map(formatVocabEntryAsTs).join("\n") + "\n" : "";
  return fileSource.slice(0, arrayStart) + body + fileSource.slice(closeBracketIdx);
}
