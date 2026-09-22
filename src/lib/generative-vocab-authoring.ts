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
  if (entry.irregularForms) {
    const parts: string[] = [];
    if (entry.irregularForms.presentThirdPerson) {
      parts.push(`presentThirdPerson: ${tsString(entry.irregularForms.presentThirdPerson)}`);
    }
    if (entry.irregularForms.past) {
      parts.push(`past: ${tsString(entry.irregularForms.past)}`);
    }
    lines.push(`    irregularForms: { ${parts.join(", ")} },`);
  }
  lines.push(`    topics: [${entry.topics.map(tsString).join(", ")}],`);
  lines.push("  },");
  return lines.join("\n");
}

/**
 * Splices a freshly-serialized entries array into vocab.ts's source,
 * replacing everything between `export const GENERATIVE_VOCAB:
 * VocabEntry[] = [` and the following `\n];` -- mirrors
 * pack-authoring.ts's insertPackIntoBank marker-splice pattern, but
 * replaces the WHOLE array body each time (not just appends one entry)
 * since the caller already has the complete desired array in memory
 * from mergeVocabEntries. This is what lets a repeated proposal's
 * merged topics show up correctly without surgical per-entry editing.
 * Never touches the file's header/type/comment above the marker.
 */
export function replaceVocabArrayInSource(fileSource: string, entries: VocabEntry[]): string {
  const startMarker = "export const GENERATIVE_VOCAB: VocabEntry[] = [";
  const start = fileSource.indexOf(startMarker);
  if (start === -1) {
    throw new Error(`could not find "${startMarker}" in the vocab file source.`);
  }
  const closeMarker = "\n];";
  const closeIdx = fileSource.indexOf(closeMarker, start);
  if (closeIdx === -1) {
    throw new Error(`found "${startMarker}" but no closing "];" after it.`);
  }
  const arrayStart = start + startMarker.length;
  const body = entries.length > 0 ? "\n" + entries.map(formatVocabEntryAsTs).join("\n") : "";
  // Slice AT closeIdx (not closeIdx + 1) so the "\n];" close marker is
  // preserved verbatim in the output -- it supplies the newline before
  // "];" on its own, whether body is empty or not.
  return fileSource.slice(0, arrayStart) + body + fileSource.slice(closeIdx);
}
