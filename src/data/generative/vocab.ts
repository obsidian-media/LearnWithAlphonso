import type { Level } from "../levels";

export type VocabEntry = {
  word: string;
  pos: "noun" | "verb" | "adjective";
  level: Level;
  /** Topic tag(s) this word was proposed under. Unioned (not
   *  duplicated) across repeated proposals of the same (word, pos) --
   *  see generative-vocab-authoring.ts's mergeVocabEntries. */
  topics: string[];
};

/**
 * Curated vocab dataset for the generative sentence-content pilot
 * (docs/superpowers/specs/2026-09-22-generative-sentence-content-design.md).
 * Grows ONLY through the `generate` CLI command (scripts/pack-tool.ts)
 * -- an LLM-proposed candidate is only ever added here after passing a
 * real part-of-speech cross-check against `compromise`'s own tagging
 * (src/lib/generative-vocab.server.ts's verifyCandidatePos). Never
 * hand-edit this array directly with an unvalidated entry.
 *
 * "be" is deliberately excluded -- English's only verb with a full
 * person-varying present-tense paradigm (am/are/is), which this
 * pilot's compiler (compile.ts) doesn't attempt to derive. See the
 * design doc's component 4 for the verified spike data behind this.
 */
export const GENERATIVE_VOCAB: VocabEntry[] = [];
