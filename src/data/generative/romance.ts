/**
 * Shared types and checks for the French and Spanish generative templates
 * (design: docs/superpowers/specs/2026-10-17-generative-content-fr-es-design.md).
 *
 * Nothing here imports a conjugation library. The committed tables in
 * fr-data.ts / es-data.ts are the authority; the libraries are only ever
 * imported by tests and scripts, as a second source that has to agree.
 */

/** 0=1sg 1=2sg 2=3sg 3=1pl 4=2pl 5=3pl (the libraries' own person index). */
export type Person = 0 | 1 | 2 | 3 | 4 | 5;
export type Six = readonly [string, string, string, string, string, string];

/** The ways a noun phrase may be introduced; chosen per (verb, class). */
export type ArticleKind = "definite" | "indefinite" | "partitive" | "bare";

export type NounClass =
  | "food-count"
  | "food-mass"
  | "drink"
  | "clothing"
  | "animal"
  | "school-object"
  | "household-object"
  | "vehicle"
  | "readable"
  | "watchable"
  | "openable";

/** One entry of a verb's hand-written meaning allowlist. */
export type Use = {
  cls: NounClass;
  kinds: ArticleKind[];
  /** Finer than a class: when set, only these noun keys are allowed. */
  nouns?: string[];
  /** Noun keys that are NOT allowed with this use, even though their class is. */
  except?: string[];
  /** French only: render the noun as a plural indefinite ("des légumes"). */
  pluralIndefinite?: boolean;
};

export type EnglishVerb = { base: string; third: string; past: string };

export type Gender = "m" | "f";

export type Noun = {
  /** Unique key within a language: the bare noun, e.g. "pomme", "pomme de terre". */
  key: string;
  gender: Gender;
  number: "s" | "p";
  /** false = mass noun (French partitive, Spanish bare noun). */
  count: boolean;
  classes: NounClass[];
  /** Pack id in the shipped course data where this noun appears. */
  src: string;
  /** English gloss: the noun alone, singular unless number is "p". */
  en: string;
  /** Required for every noun starting with a vowel, h, y or w. */
  elides?: boolean;
  /** Spanish only; required for every noun starting with a, á, ha, há. */
  stressedA?: boolean;
  /** Spanish only: where the gender comes from. */
  genderEvidence?: "corpus" | "wiktionary";
};

export type RomanceTemplateId =
  "fr-svo-present" | "fr-svo-pc" | "fr-etre-pc" | "es-svo-present" | "es-svo-preterite";

/** One fully compiled sentence plus everything a gate needs to re-derive it. */
export type GeneratedItem = {
  lang: "fr" | "es";
  template: RomanceTemplateId;
  tense: "present" | "past";
  subject: string;
  person: Person;
  verb: string;
  /** noun key, or place key for fr-etre-pc */
  object: string;
  articleKind: ArticleKind | "place";
  /** Prompt with the blank, e.g. "Elle ___ (manger) du pain." */
  prompt: string;
  answer: string;
  /** Every spelling that is correct for this line's subject, verb and tense. */
  accepted: string[];
  /** The pack data line: "prompt|answer". */
  line: string;
  /** Owner-sample English meaning (never put in learner text). */
  en: string;
};

/** The finished sentence a learner would read: blank filled, verb hint dropped. */
export function completeSentence(prompt: string, choice: string): string {
  return prompt.replace("___", choice).replace(/ \([^)]*\)/, "");
}

export const SUBJECT_EN = {
  je: "I",
  tu: "you",
  il: "he",
  elle: "she",
  nous: "we",
  vous: "you",
  ils: "they",
  elles: "they",
  yo: "I",
  tú: "you",
  él: "he",
  ella: "she",
  nosotros: "we",
  ellos: "they",
  ellas: "they",
  ustedes: "you",
} as const;

export function startsWithVowelSound(word: string): boolean {
  return /^[aeiouyàâäéèêëîïôöùûüœæ]/i.test(word);
}

/** "a"/"an" for the owner-sample English gloss only (never learner text). */
export function enIndefinite(noun: string): string {
  return /^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`;
}

/** Characters that begin a vowel sound or may begin one (h, y, w need a flag). */
export function needsElisionFlag(word: string): boolean {
  return /^[aeiouàâäéèêëîïôöùûüœæhywáíóú]/i.test(word.normalize("NFC"));
}

export type TypographyDefect = string;

/** Language-neutral surface checks on a completed sentence. */
export function typographyDefects(sentence: string): TypographyDefect[] {
  const defects: string[] = [];
  if (sentence !== sentence.trim()) defects.push("leading or trailing space");
  if (/ {2,}/.test(sentence)) defects.push("double space");
  if (/ [.,;:!?]/.test(sentence)) defects.push("space before punctuation");
  if (sentence.includes("--")) defects.push('contains "--"');
  if (sentence.includes("___")) defects.push("unfilled blank");
  if (!sentence.endsWith(".") || /\.\.$/.test(sentence)) defects.push("must end in one full stop");
  const first = sentence.charAt(0);
  if (first !== first.toUpperCase() || first === first.toLowerCase())
    defects.push("must start with a capital letter");
  return defects;
}
