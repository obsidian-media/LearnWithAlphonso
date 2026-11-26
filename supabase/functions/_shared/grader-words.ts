import en from "./grader-words/en.ts";
import es from "./grader-words/es.ts";
import fr from "./grader-words/fr.ts";

// Deno copy of src/lib/grader-words.ts (an Edge Function cannot import from src/); the data files in ./grader-words
// are byte-identical to src/data/grader-words (grader-words-parity.test.ts). See src/data/grader-words/README.md.
const RAW = { en, fr, es } as const;
const SETS: Partial<Record<keyof typeof RAW, Set<string>>> = {};

/** Whether `word` (any case) is a real word of 5+ letters in the course's language; shorter words are never looked up. */
export function isRealWord(word: string, course: keyof typeof RAW): boolean {
  const raw = RAW[course];
  if (!raw) return false;
  const set = (SETS[course] ??= new Set(raw.split(" ")));
  return set.has(word.toLowerCase());
}
