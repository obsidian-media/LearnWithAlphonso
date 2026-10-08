import type { Course } from "./courses";

/**
 * A deliberately simple language guess for AUTHORED content, used only
 * by tests to catch a variant pasted under the wrong course key (an English
 * opener left under `fr`, a French prompt under `es`). It is not a general
 * language detector and must never run on user input.
 *
 * Signals: high-frequency function words that are distinctive to one of the
 * three languages (words shared between two of them, like "la", "de", "que",
 * "en", "es", "un", "y", "se", "me", "no", "on", "a", "tu", are left out on
 * purpose), plus characters only one of the languages uses: ¿ ¡ ñ á í ó ú for
 * Spanish, à â è ê ë î ï ô ù û ç œ for French. "é" is shared, so it is ignored.
 */
const words = (list: string): ReadonlySet<string> => new Set(list.split(" "));

const STOPWORDS: Record<Course, ReadonlySet<string>> = {
  en: words(
    "the and you your is are to of with what have can i we this there how here my do for in " +
      "at be it an so about they their them that not just would could will think please " +
      "thanks hi hey okay",
  ),
  fr: words(
    "le les des du au aux est et vous je une pour pas avec dans ce qui sur ne mais il elle " +
      "nous votre vos mon ma sont êtes avez bonjour oui merci c j l qu n ça voici bien ici " +
      "ton ta tes toujours",
  ),
  es: words(
    "el los las del al lo una para por con pero está usted ustedes yo muy qué cómo dónde " +
      "aquí eres su sus nos este esta esto hay ya hola gracias algo también porque siempre",
  ),
};

const MARKER_CHARS: Record<"fr" | "es", RegExp> = {
  es: /[¿¡ñáíóú]/g,
  fr: /[àâèêëîïôùûçœ]/g,
};

export type LanguageScores = Record<Course, number>;

export function languageScores(text: string): LanguageScores {
  const lower = text.toLowerCase();
  const tokens = lower.split(/[^a-zÀ-ɏ]+/).filter(Boolean);
  const scores: LanguageScores = { en: 0, fr: 0, es: 0 };
  for (const token of tokens) {
    for (const course of ["en", "fr", "es"] as const) {
      if (STOPWORDS[course].has(token)) scores[course] += 1;
    }
  }
  for (const course of ["fr", "es"] as const) {
    scores[course] += (lower.match(MARKER_CHARS[course]) ?? []).length;
  }
  return scores;
}

/**
 * The course whose score is at least `minScore` and strictly higher than
 * both others, or null when the text gives no clear answer.
 */
export function detectContentLanguage(text: string, minScore = 2): Course | null {
  const scores = languageScores(text);
  const ranked = (Object.keys(scores) as Course[]).sort((a, b) => scores[b] - scores[a]);
  const [best, second] = ranked;
  if (scores[best] < minScore || scores[best] === scores[second]) return null;
  return best;
}
