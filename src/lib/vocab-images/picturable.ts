import policy from "../../../shared/say-the-picture-deny.json";
import {
  classifyImageability,
  lookupForm,
  normalizeTerm,
  type ImageCategory,
} from "./imageability";
import { IMAGE_LANGS, type ImageLang, type VocabImageRecord } from "./types";

/**
 * Which vocab pictures Say the Picture may use (build 72 owner feedback: "The pictures would be confusing a lot").
 *
 * A word is left out when it names an action (a photo of "hiking" is a person on a hill, and the learner says "mountain"),
 * or is on the shared deny list: words whose photo reads as a different word. The rule data is
 * `shared/say-the-picture-deny.json`, one file for the three runtimes. The category comes from
 * `scripts/vocab-imageability.json`, the same file that decided the word could have a picture at all.
 *
 * The native apps do not carry the rule: the export bakes its answer into each vocab-images.json entry
 * (`category`, `picturable`, see `withPicturability`) and they read that.
 */
type Policy = { excludedCategories: ImageCategory[]; deny: Record<ImageLang, string[]> };
const POLICY = policy as Policy;
const EXCLUDED = new Set<ImageCategory>(POLICY.excludedCategories);
const DENIED: Record<ImageLang, Set<string>> = {
  en: new Set(POLICY.deny.en.map(normalizeTerm)),
  fr: new Set(POLICY.deny.fr.map(normalizeTerm)),
  es: new Set(POLICY.deny.es.map(normalizeTerm)),
};

/** The imageability category of a term in a language, when it has one (it always has, for a term that has a photo). */
export function pictureCategory(term: string, lang: ImageLang): ImageCategory | undefined {
  const c = classifyImageability(term, lang);
  return c.imageable ? c.category : undefined;
}

/**
 * Whether Say the Picture may show this term's photo. A term with no category is NOT picturable: nothing says what the
 * photo shows, and the activity cannot ask a learner to name a picture it cannot vouch for.
 */
export function isPicturable(term: string, lang: ImageLang): boolean {
  const category = pictureCategory(term, lang);
  if (!category || EXCLUDED.has(category)) return false;
  return !DENIED[lang].has(normalizeTerm(term)) && !DENIED[lang].has(lookupForm(term, lang));
}

/** The language a stored photo was chosen for: the first folder of its object path (`.../vocab-images/<lang>/<slug>.jpg`). */
export function imageLangOfUrl(url: string): ImageLang | undefined {
  const m = /\/vocab-images\/([a-z]{2})\//.exec(url);
  return m ? IMAGE_LANGS.find((l) => l === m[1]) : undefined;
}

export type PicturableImage = VocabImageRecord & { category?: ImageCategory; picturable: boolean };

/** The native bundle's entries: each photo plus the Say the Picture answer for the word it was chosen for. */
export function withPicturability(
  images: Record<string, VocabImageRecord>,
): Record<string, PicturableImage> {
  const out: Record<string, PicturableImage> = {};
  for (const [key, image] of Object.entries(images)) {
    const lang = imageLangOfUrl(image.url);
    if (!lang) throw new Error(`vocab image "${key}": no language in its URL ${image.url}`);
    const category = pictureCategory(key, lang);
    out[key] = {
      ...image,
      ...(category ? { category } : {}),
      picturable: isPicturable(key, lang),
    };
  }
  return out;
}
