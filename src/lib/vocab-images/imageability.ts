import rawData from "../../../scripts/vocab-imageability.json";
import { IMAGE_LANGS, type ImageLang } from "./types";

export type ImageCategory = "noun" | "action" | "place" | "food";
export const IMAGE_CATEGORIES: readonly ImageCategory[] = ["noun", "action", "place", "food"];

export type ImageabilityData = {
  version: number;
  imageable: Record<ImageLang, Record<ImageCategory, string[]>>;
  /** English search phrase per lookup form. Required for fr/es imageable terms, optional override for en. */
  queries: Record<ImageLang, Record<string, string>>;
  deny: Record<ImageLang, string[]>;
  functionWords: Record<ImageLang, string[]>;
};

export type NotImageableReason =
  | "empty"
  | "phrase"
  | "contraction"
  | "denied"
  | "function-word"
  | "not-listed"
  | "no-query";

export type Imageability =
  | { imageable: true; category: ImageCategory; lookup: string; query: string }
  | { imageable: false; reason: NotImageableReason; lookup: string };

export const IMAGEABILITY_DATA = rawData as ImageabilityData;

export function normalizeTerm(term: string): string {
  return term.normalize("NFC").replace(/[’‘`]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
}

const ARTICLE: Record<ImageLang, RegExp> = {
  en: /^(?:the|a|an) /,
  fr: /^(?:l'|de l'|(?:le|la|les|un|une|des|du|de la) )/,
  es: /^(?:el|la|los|las|un|una|unos|unas) /,
};

/** Lowercased, NFC, straight apostrophes, one leading article removed. */
export function lookupForm(term: string, lang: ImageLang): string {
  return normalizeTerm(term).replace(ARTICLE[lang], "").trim();
}

const PHRASE_PUNCT = /[?¿!¡…".,;:()“”«»]/;
const CONTRACTION: Record<ImageLang, RegExp | null> = {
  en: /n't\b|'(?:ll|re|ve|d|m|s)\b/,
  fr: /^(?:j|c|n|qu|d|m|t|s|jusqu|lorsqu|puisqu)'/,
  es: null,
};

type LangIndex = { deny: Set<string>; fn: Set<string>; category: Map<string, ImageCategory> };
const indexCache = new WeakMap<ImageabilityData, Record<ImageLang, LangIndex>>();

function indexFor(data: ImageabilityData): Record<ImageLang, LangIndex> {
  const cached = indexCache.get(data);
  if (cached) return cached;
  const built = {} as Record<ImageLang, LangIndex>;
  for (const lang of IMAGE_LANGS) {
    const category = new Map<string, ImageCategory>();
    for (const c of IMAGE_CATEGORIES) for (const t of data.imageable[lang][c]) category.set(t, c);
    built[lang] = { deny: new Set(data.deny[lang]), fn: new Set(data.functionWords[lang]), category };
  }
  indexCache.set(data, built);
  return built;
}

export function classifyImageability(
  term: string,
  lang: ImageLang,
  data: ImageabilityData = IMAGEABILITY_DATA,
): Imageability {
  const normalized = normalizeTerm(term);
  const lookup = lookupForm(term, lang);
  const idx = indexFor(data)[lang];
  const no = (reason: NotImageableReason): Imageability => ({ imageable: false, reason, lookup });

  if (!lookup) return no("empty");
  if (PHRASE_PUNCT.test(normalized) || normalized.split(" ").length >= 4) return no("phrase");
  const contraction = CONTRACTION[lang];
  if (contraction && contraction.test(normalized)) return no("contraction");
  if (idx.deny.has(normalized) || idx.deny.has(lookup)) return no("denied");
  if (idx.fn.has(normalized) || idx.fn.has(lookup)) return no("function-word");
  const category = idx.category.get(lookup);
  if (!category) return no("not-listed");
  const query = data.queries[lang][lookup] ?? (lang === "en" ? lookup : undefined);
  if (!query) return no("no-query");
  return { imageable: true, category, lookup, query };
}

export function validateImageabilityData(data: ImageabilityData): string[] {
  const problems: string[] = [];
  for (const lang of IMAGE_LANGS) {
    const seen = new Map<string, ImageCategory>();
    for (const c of IMAGE_CATEGORIES) {
      for (const t of data.imageable[lang][c]) {
        const form = lookupForm(t, lang);
        if (form !== t) problems.push(`${lang}: "${t}" is not in lookup form ("${form}")`);
        if (seen.has(t)) problems.push(`${lang}: "${t}" is in more than one category`);
        seen.set(t, c);
      }
    }
    const deny = new Set(data.deny[lang]);
    const fn = new Set(data.functionWords[lang]);
    for (const t of data.deny[lang]) {
      if (normalizeTerm(t) !== t) problems.push(`${lang}: deny "${t}" is not normalized`);
    }
    for (const t of seen.keys()) {
      if (deny.has(t)) problems.push(`${lang}: "${t}" is both denied and imageable`);
      if (fn.has(t)) problems.push(`${lang}: "${t}" is both a function word and imageable`);
      if (lang !== "en" && !data.queries[lang][t]?.trim()) {
        problems.push(`${lang}: imageable "${t}" has no English query`);
      }
    }
    for (const t of Object.keys(data.queries[lang])) {
      if (!seen.has(t)) problems.push(`${lang}: query for "${t}" but the term is not imageable`);
    }
  }
  return problems;
}
