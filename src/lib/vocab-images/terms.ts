import { COURSES, getCourse } from "../../data/courses";
import { deriveVocab } from "../../data/vocab";
import {
  IMAGEABILITY_DATA,
  classifyImageability,
  type ImageCategory,
  type ImageabilityData,
} from "./imageability";
import { IMAGE_LANGS, type ImageLang } from "./types";

/** VOCAB_IMAGES key (lowercased term) -> the courses whose lessons show it, and its first meaning. */
export type TermIndex = Map<string, { langs: Set<ImageLang>; meaning: string }>;

/**
 * Every key a vocab card or an image-matching question can look up,
 * exactly as deriveVocab and question.imageKey do (lowercased, trimmed).
 */
export function vocabTermIndex(): TermIndex {
  const index: TermIndex = new Map();
  const add = (key: string, lang: ImageLang, meaning: string) => {
    const hit = index.get(key);
    if (hit) hit.langs.add(lang);
    else index.set(key, { langs: new Set([lang]), meaning });
  };
  for (const { id } of COURSES) {
    for (const unit of getCourse(id).curriculum) {
      for (const lesson of unit.lessons) {
        for (const item of deriveVocab(lesson)) add(item.term.trim().toLowerCase(), id, item.meaning);
        for (const q of lesson.questions) {
          if (q.type === "mc" && q.imageKey) add(q.imageKey.trim().toLowerCase(), id, q.explanation);
        }
      }
    }
  }
  return index;
}

export type PlannedTerm = {
  key: string;
  lang: ImageLang;
  query: string;
  category: ImageCategory;
  meaning: string;
};

/**
 * A key gets an image only if it is imageable, with the SAME query, in
 * every course whose lessons show it. Images are looked up by key
 * regardless of course, so a homograph ("pain": hurt / bread) would show
 * one course's picture on the other course's card.
 */
export function planImageableTerms(
  index: TermIndex,
  data: ImageabilityData = IMAGEABILITY_DATA,
  restrictTo?: ReadonlySet<string>,
): { planned: PlannedTerm[]; skipped: { key: string; reason: string }[] } {
  const planned: PlannedTerm[] = [];
  const skipped: { key: string; reason: string }[] = [];
  for (const [key, { langs, meaning }] of index) {
    if (restrictTo && !restrictTo.has(key)) continue;
    const results = IMAGE_LANGS.filter((l) => langs.has(l)).map(
      (lang) => ({ lang, result: classifyImageability(key, lang, data) }) as const,
    );
    const first = results.find((r) => r.result.imageable);
    if (!first || !first.result.imageable) {
      skipped.push({
        key,
        reason: results.map((r) => `${r.lang}: ${r.result.imageable ? "ok" : r.result.reason}`).join(", "),
      });
      continue;
    }
    const firstQuery = first.result.query.toLowerCase();
    const conflict = results.find(
      (r) => !r.result.imageable || r.result.query.toLowerCase() !== firstQuery,
    );
    if (conflict) {
      const why = conflict.result.imageable ? `query "${conflict.result.query}"` : conflict.result.reason;
      skipped.push({ key, reason: `cross-language conflict (${conflict.lang}: ${why})` });
      continue;
    }
    planned.push({ key, lang: first.lang, query: first.result.query, category: first.result.category, meaning });
  }
  planned.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { planned, skipped };
}
