import type { RehearsalBrief } from "./rehearsal-brief";

export type PhraseRow = { phrase: string; meaning: string | null };

/**
 * The brief's key phrases, each with its meaning line when there is one. Meanings exist only on a hand-written
 * quick-start brief and are index-aligned with the phrases; a list that does not line up is ignored whole, so a
 * phrase is never shown beside another phrase's meaning.
 */
export function phraseRows(brief: RehearsalBrief): PhraseRow[] {
  const meanings = brief.keyPhraseMeanings;
  const aligned =
    Array.isArray(meanings) &&
    meanings.length === brief.keyPhrases.length &&
    meanings.every((m) => typeof m === "string" && m.trim() !== "");
  return brief.keyPhrases.map((phrase, i) => ({
    phrase,
    meaning: aligned ? meanings![i]! : null,
  }));
}
