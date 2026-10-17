import { ES_NOUNS, ES_VERBS, type EsVerb } from "./es-data";
import {
  SUBJECT_EN,
  enIndefinite,
  type ArticleKind,
  type GeneratedItem,
  type Noun,
  type Person,
  type RomanceTemplateId,
} from "./romance";

export type EsSubject = {
  /** Lower case as written mid-sentence; capitalised at the start. */
  word: "yo" | "tú" | "él" | "ella" | "nosotros" | "ellos" | "ellas" | "ustedes";
  person: Person;
};

/** vosotros is deliberately absent: the course teaches ustedes (design doc, section 3). */
export const ES_SUBJECTS: EsSubject[] = [
  { word: "yo", person: 0 },
  { word: "tú", person: 1 },
  { word: "él", person: 2 },
  { word: "ella", person: 2 },
  { word: "nosotros", person: 3 },
  { word: "ellos", person: 5 },
  { word: "ellas", person: 5 },
  { word: "ustedes", person: 5 },
];

/** Which article kinds are grammatical for this noun at all. */
export function esFeasibleKinds(noun: Noun): ArticleKind[] {
  if (!noun.count) return ["bare"];
  if (noun.number === "p") return ["definite", "indefinite"];
  return ["indefinite", "definite"];
}

export function esNounPhrase(noun: Noun, kind: ArticleKind): string {
  const plural = noun.number === "p";
  const m = noun.gender === "m";
  switch (kind) {
    case "definite":
      return `${plural ? (m ? "los" : "las") : m ? "el" : "la"} ${noun.key}`;
    case "indefinite":
      return `${plural ? (m ? "unos" : "unas") : m ? "un" : "una"} ${noun.key}`;
    case "bare":
      return noun.key;
    case "partitive":
      throw new Error("Spanish has no partitive article kind");
  }
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function englishNounPhrase(noun: Noun, kind: ArticleKind): string {
  const plural = noun.number === "p";
  if (kind === "definite") return `the ${noun.en}`;
  if (kind === "indefinite") return plural ? noun.en : enIndefinite(noun.en);
  return noun.en;
}

export function esVerb(inf: string): EsVerb {
  const v = ES_VERBS.find((x) => x.inf === inf);
  if (!v) throw new Error(`unknown Spanish verb "${inf}"`);
  return v;
}

export function compileEs(
  template: "es-svo-present" | "es-svo-preterite",
  subject: EsSubject,
  verb: EsVerb,
  noun: Noun,
  kind: ArticleKind,
): GeneratedItem {
  const past = template === "es-svo-preterite";
  const table = past ? verb.preterite : verb.present;
  if (!table) throw new Error(`${verb.inf} has no ${past ? "preterite" : "present"} table`);
  const answer = table[subject.person];
  const accepted = [answer, ...(past ? [] : (verb.presentAlt?.[subject.person] ?? []))];
  const np = esNounPhrase(noun, kind);
  const lead = past ? `Ayer ${subject.word}` : capitalise(subject.word);
  const prompt = `${lead} ___ (${verb.inf}) ${np}.`;
  const third = subject.person === 2;
  const englishVerb = past ? verb.en.past : third ? verb.en.third : verb.en.base;
  const body = `${SUBJECT_EN[subject.word]} ${englishVerb} ${englishNounPhrase(noun, kind)}`;
  const text = past ? `Yesterday, ${body}` : body;
  return {
    lang: "es",
    template,
    tense: past ? "past" : "present",
    subject: subject.word,
    person: subject.person,
    verb: verb.inf,
    object: noun.key,
    articleKind: kind,
    prompt,
    answer,
    accepted,
    line: `${prompt}|${answer}`,
    en: `${text.charAt(0).toUpperCase()}${text.slice(1)}.`,
  };
}

/**
 * Every sentence a template may emit for a verb, before sampling. Enforced
 * here and re-checked independently by tests: the (verb, class, article kind)
 * triple is on the verb's allowlist, the article kind is grammatical for the
 * noun, stressed-a nouns are excluded, and a verb without a preterite table
 * is never used in the preterite.
 */
export function esCandidates(template: RomanceTemplateId, verbInf: string): GeneratedItem[] {
  if (template !== "es-svo-present" && template !== "es-svo-preterite") return [];
  const verb = esVerb(verbInf);
  if (
    template === "es-svo-preterite" &&
    (!verb.preterite || verb.tenses?.includes("preterite") === false)
  )
    return [];
  if (template === "es-svo-present" && verb.tenses?.includes("present") === false) return [];
  const out: GeneratedItem[] = [];
  for (const subject of ES_SUBJECTS)
    for (const use of verb.uses)
      for (const noun of ES_NOUNS) {
        if (noun.stressedA === true) continue;
        if (!noun.classes.includes(use.cls)) continue;
        if (use.nouns && !use.nouns.includes(noun.key)) continue;
        for (const kind of use.kinds) {
          if (!esFeasibleKinds(noun).includes(kind)) continue;
          out.push(compileEs(template, subject, verb, noun, kind));
        }
      }
  return out;
}
