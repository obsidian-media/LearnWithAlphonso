import {
  FR_AVOIR_PRESENT,
  FR_NOUNS,
  FR_PLACES,
  FR_VERBS,
  type FrPlace,
  type FrVerb,
} from "./fr-data";
import {
  SUBJECT_EN,
  completeSentence,
  enIndefinite,
  type ArticleKind,
  type GeneratedItem,
  type Noun,
  type Person,
  type RomanceTemplateId,
} from "./romance";

export type FrSubject = {
  word: "je" | "tu" | "il" | "elle" | "nous" | "vous" | "ils" | "elles";
  person: Person;
  gender: "m" | "f" | null;
  number: "s" | "p";
};

export const FR_SUBJECTS: FrSubject[] = [
  { word: "je", person: 0, gender: null, number: "s" },
  { word: "tu", person: 1, gender: null, number: "s" },
  { word: "il", person: 2, gender: "m", number: "s" },
  { word: "elle", person: 2, gender: "f", number: "s" },
  { word: "nous", person: 3, gender: null, number: "p" },
  { word: "vous", person: 4, gender: null, number: "p" },
  { word: "ils", person: 5, gender: "m", number: "p" },
  { word: "elles", person: 5, gender: "f", number: "p" },
];

const VOWEL_START = /^[aeiouàâäéèêëîïôöùûüœæ]/i;

/**
 * Whether an article before `word` elides (l', de l', j'). Vowels always do;
 * h, y and w need an explicit flag, so an unflagged one returns undefined and
 * every consumer treats that as a defect rather than guessing.
 */
export function frElidesIn(word: string, flags: ReadonlyMap<string, boolean>): boolean | undefined {
  const w = word.toLowerCase();
  if (VOWEL_START.test(w)) return true;
  if (/^[hyw]/.test(w)) return flags.get(w);
  return false;
}

function buildFlags(): Map<string, boolean> {
  const flags = new Map<string, boolean>();
  const add = (word: string, elides: boolean | undefined) => {
    const first = word.split(" ")[0]!.toLowerCase();
    if (/^[hyw]/.test(first) && elides !== undefined) flags.set(first, elides);
  };
  for (const n of FR_NOUNS) add(n.key, n.elides);
  for (const p of FR_PLACES) add(p.key, p.elides);
  for (const v of FR_VERBS) {
    add(v.inf, v.elides);
    for (const f of [...v.present, v.participle]) add(f, v.elides);
  }
  return flags;
}
export const FR_H_FLAGS: ReadonlyMap<string, boolean> = buildFlags();

export function frNounElides(noun: Noun): boolean {
  return frElidesIn(noun.key, FR_H_FLAGS) === true;
}

/** Which article kinds are grammatical for this noun at all. */
export function frFeasibleKinds(noun: Noun): ArticleKind[] {
  if (!noun.count) return ["partitive"];
  return ["indefinite", "definite"];
}

export function frNounPhrase(noun: Noun, kind: ArticleKind): string {
  const elide = frNounElides(noun);
  const plural = noun.number === "p";
  switch (kind) {
    case "definite":
      return plural
        ? `les ${noun.key}`
        : elide
          ? `l'${noun.key}`
          : `${noun.gender === "m" ? "le" : "la"} ${noun.key}`;
    case "indefinite":
      return plural ? `des ${noun.key}` : `${noun.gender === "m" ? "un" : "une"} ${noun.key}`;
    case "partitive":
      if (plural) return `des ${noun.key}`;
      return elide
        ? `de l'${noun.key}`
        : noun.gender === "m"
          ? `du ${noun.key}`
          : `de la ${noun.key}`;
    case "bare":
      throw new Error("French has no bare article kind");
  }
}

/** The verb's own initial sound decides whether `je` may be used (j' would be needed). */
export function frVerbElides(verb: FrVerb): boolean {
  return frElidesIn(verb.inf, FR_H_FLAGS) === true;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function englishNounPhrase(noun: Noun, kind: ArticleKind): string {
  const plural = noun.number === "p";
  if (kind === "definite") return `the ${noun.en}`;
  if (kind === "indefinite") return plural ? noun.en : enIndefinite(noun.en);
  return noun.en; // partitive: bare noun
}

function englishSubjectVerb(subject: FrSubject, verb: FrVerb, tense: "present" | "past"): string {
  const pronoun = SUBJECT_EN[subject.word];
  if (tense === "past") return `${pronoun} ${verb.en.past}`;
  const third = subject.person === 2 && subject.number === "s";
  return `${pronoun} ${third ? verb.en.third : verb.en.base}`;
}

function sentenceEn(prefixPast: boolean, body: string): string {
  const text = prefixPast ? `Yesterday, ${body}` : body;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`.replace(/^I\b/, "I");
}

/** fr-svo-present and fr-svo-pc share the noun-phrase half. */
export function compileFrObject(
  template: "fr-svo-present" | "fr-svo-pc",
  subject: FrSubject,
  verb: FrVerb,
  noun: Noun,
  kind: ArticleKind,
): GeneratedItem {
  const past = template === "fr-svo-pc";
  const np = frNounPhrase(noun, kind);
  const form = verb.present[subject.person];
  const answer = past ? `${FR_AVOIR_PRESENT[subject.person]} ${verb.participle}` : form;
  const accepted = past ? [answer] : [form, ...(verb.presentAlt?.[subject.person] ?? [])];
  const lead = past ? `Hier, ${subject.word}` : capitalise(subject.word);
  const prompt = `${lead} ___ (${verb.inf}) ${np}.`;
  const en = sentenceEn(
    past,
    `${englishSubjectVerb(subject, verb, past ? "past" : "present")} ${englishNounPhrase(noun, kind)}`,
  );
  return {
    lang: "fr",
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
    en,
  };
}

export type FrEtreSubject = FrSubject & { gender: "m" | "f" };

export function etreAgreement(subject: FrEtreSubject): "ms" | "fs" | "mp" | "fp" {
  return `${subject.gender}${subject.number}` as "ms" | "fs" | "mp" | "fp";
}

export function compileFrEtre(subject: FrEtreSubject, verb: FrVerb, place: FrPlace): GeneratedItem {
  if (!verb.pcEtre || !verb.places) throw new Error(`${verb.inf} is not an être verb`);
  const phrase = place.forms[verb.places.rel];
  if (!phrase)
    throw new Error(`${verb.inf}: place "${place.key}" has no ${verb.places.rel} phrase`);
  const answer = verb.pcEtre[etreAgreement(subject)];
  const prompt = `Hier, ${subject.word} ___ (${verb.inf}) ${phrase}.`;
  const en = sentenceEn(
    true,
    `${SUBJECT_EN[subject.word]} ${verb.en.past} ${place.en[verb.places.enRel ?? verb.places.rel]}`,
  );
  return {
    lang: "fr",
    template: "fr-etre-pc",
    tense: "past",
    subject: subject.word,
    person: subject.person,
    verb: verb.inf,
    object: place.key,
    articleKind: "place",
    prompt,
    answer,
    accepted: [answer],
    line: `${prompt}|${answer}`,
    en,
  };
}

export const FR_ETRE_SUBJECTS: FrEtreSubject[] = FR_SUBJECTS.filter(
  (s): s is FrEtreSubject => s.gender !== null,
);

export function frVerb(inf: string): FrVerb {
  const v = FR_VERBS.find((x) => x.inf === inf);
  if (!v) throw new Error(`unknown French verb "${inf}"`);
  return v;
}

/**
 * Every sentence a template may emit for a verb, before any sampling. Rules
 * enforced here (each also re-checked independently by a test):
 *  - the (verb, class, article kind) triple is on the verb's own allowlist,
 *  - `je` is never used with a vowel/mute-h verb in the present (J'___),
 *  - the avoir passé composé never uses `je` (the unit "ai mangé" would need J'),
 *  - être sentences only use il/elle/ils/elles and the verb's place allowlist.
 */
export function frCandidates(template: RomanceTemplateId, verbInf: string): GeneratedItem[] {
  const verb = frVerb(verbInf);
  const out: GeneratedItem[] = [];
  if (template === "fr-etre-pc") {
    if (verb.aux !== "etre" || !verb.places) return out;
    for (const subject of FR_ETRE_SUBJECTS)
      for (const key of verb.places.keys) {
        const place = FR_PLACES.find((p) => p.key === key);
        if (place && place.forms[verb.places.rel]) out.push(compileFrEtre(subject, verb, place));
      }
    return out;
  }
  if (template !== "fr-svo-present" && template !== "fr-svo-pc") return out;
  if (verb.aux !== "avoir" || !verb.uses) return out;
  for (const subject of FR_SUBJECTS) {
    if (subject.word === "je" && (template === "fr-svo-pc" || frVerbElides(verb))) continue;
    for (const use of verb.uses)
      for (const noun of FR_NOUNS) {
        if (!noun.classes.includes(use.cls)) continue;
        if (use.nouns && !use.nouns.includes(noun.key)) continue;
        for (const kind of use.kinds) {
          if (!frFeasibleKinds(noun).includes(kind)) continue;
          out.push(compileFrObject(template, subject, verb, noun, kind));
        }
      }
  }
  return out;
}

export { completeSentence };
