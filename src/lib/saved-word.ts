/**
 * Pure rules for the save-any-word feature (spec:
 * docs/superpowers/specs/2026-10-05-save-any-word-design.md). No I/O and no
 * Node-only imports, so the web client can reuse it in the web phase.
 */
export type SavedWordCourse = "en" | "fr" | "es";
export type SavedWordInput = { word: string; sentence: string; course: SavedWordCourse };
export type WordDefinition = { meaning: string; translation: string; wrong: string[] };
export type SavedWordCard = {
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
};

/** Per learner, per course. Without a cap the review queue grows unboundedly. */
export const SAVED_WORD_LIMIT = 500;

const COURSES = new Set<string>(["en", "fr", "es"]);
const WORD_MAX = 40;
const SENTENCE_MAX = 300;
const TEXT_MAX = 160;
// Starts with a letter; letters, apostrophes (straight or typographic) and
// hyphens after that. No spaces, digits or punctuation: one word at a time.
const WORD_PATTERN = /^\p{L}[\p{L}'’-]*$/u;

export function validateSavedWordInput(
  raw: unknown,
): { ok: true; value: SavedWordInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid request" };
  const { word, sentence, course } = raw as Record<string, unknown>;
  if (typeof word !== "string" || typeof sentence !== "string" || typeof course !== "string") {
    return { ok: false, error: "Invalid request" };
  }
  if (!COURSES.has(course)) return { ok: false, error: "Unknown course" };

  // NFC first: \p{L} does not match a combining accent, so a decomposed
  // "e" + U+0301 would fail the word pattern and split in the tokenizer below.
  // The normalised forms are what is stored, matching the item key.
  const w = word.trim().normalize("NFC");
  if (w.length < 1 || w.length > WORD_MAX || !WORD_PATTERN.test(w)) {
    return { ok: false, error: "That doesn't look like a single word" };
  }
  const s = sentence.trim().normalize("NFC");
  if (s.length < 1 || s.length > SENTENCE_MAX) {
    return { ok: false, error: "The sentence is missing or too long" };
  }
  // Whole-word match, not a substring: "he" must not be found in "the"
  // (CodeRabbit review). Tokens follow the same rule as the client's word
  // segmenter -- letters, with an apostrophe or hyphen only BETWEEN letters --
  // and a typographic apostrophe equals a straight one, as in the item key.
  const fold = (x: string) => x.toLowerCase().replace(/’/g, "'");
  const tokens = s.match(/\p{L}(?:\p{L}|['’-](?=\p{L}))*/gu) ?? [];
  if (!tokens.some((token) => fold(token) === fold(w))) {
    return { ok: false, error: "The sentence must contain the word" };
  }
  return { ok: true, value: { word: w, sentence: s, course: course as SavedWordCourse } };
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length >= 1 && t.length <= TEXT_MAX ? t : null;
}

/**
 * Extracts and strictly validates the model's JSON. The model sometimes
 * wraps JSON in a code fence or a sentence, so the outermost braces are
 * taken; anything that does not meet the contract returns null and the
 * caller writes no row.
 */
export function parseDefinition(text: string): WordDefinition | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const { meaning, translation, wrong } = obj as Record<string, unknown>;

  const m = cleanText(meaning);
  if (!m) return null;
  if (!Array.isArray(wrong) || wrong.length !== 3) return null;
  const w = wrong.map(cleanText);
  if (w.some((x) => x === null)) return null;
  const wrongs = w as string[];
  const lower = wrongs.map((x) => x.toLowerCase());
  if (new Set(lower).size !== 3) return null;
  if (lower.includes(m.toLowerCase())) return null;

  const t = typeof translation === "string" ? translation.trim().slice(0, TEXT_MAX) : "";
  return { meaning: m, translation: t, wrong: wrongs };
}

/** Fisher-Yates; `random` is injectable so tests are reproducible. */
function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * The server, not the model, builds the card: the model only supplies text.
 * Validation guarantees the four choices are distinct, so `indexOf` is exact.
 */
export function buildSavedWordCard(args: {
  word: string;
  sentence: string;
  definition: WordDefinition;
  random?: () => number;
}): SavedWordCard {
  const { word, sentence, definition } = args;
  const choices = shuffle([definition.meaning, ...definition.wrong], args.random ?? Math.random);
  const translationAdds =
    definition.translation.length > 0 &&
    definition.translation.toLowerCase() !== definition.meaning.toLowerCase();
  return {
    prompt: `What does "${word}" mean here?\n${sentence}`,
    choices,
    answerIndex: choices.indexOf(definition.meaning),
    explanation: `"${word}" means ${definition.meaning}.${translationAdds ? ` (${definition.translation})` : ""}`,
  };
}
