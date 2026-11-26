import en from "../data/grader-words/en";
import es from "../data/grader-words/es";
import fr from "../data/grader-words/fr";

// Per-language "is this a real word?" lists for the written-answer grader (decideVerdict). The Deno copy is
// supabase/functions/_shared/grader-words.ts; the data files are byte-identical (grader-words-parity.test.ts).
// Each list is parsed into a Set the first time its language is asked for, not at import.
const RAW = { en, fr, es } as const;
const SETS: Partial<Record<keyof typeof RAW, Set<string>>> = {};

/** Whether `word` (any case) is a real word of 5+ letters in the course's language; shorter words are never looked up. */
export function isRealWord(word: string, course: keyof typeof RAW): boolean {
  const raw = RAW[course];
  if (!raw) return false;
  const set = (SETS[course] ??= new Set(raw.split(" ")));
  return set.has(word.toLowerCase());
}
