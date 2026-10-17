import type { Pack } from "../bank-engine";
import { hash, packQuestions } from "../bank-engine";
import { BANK_ES } from "../lesson-bank-es";
import { BANK_FR } from "../lesson-bank-fr";
import type { Level } from "../levels";
import { normaliseWritten } from "../../lib/translation-answer";
import { ES_NOUNS } from "./es-data";
import { esCandidates } from "./es-compile";
import { FR_NOUNS } from "./fr-data";
import { frCandidates } from "./fr-compile";
import type { GeneratedItem, NounClass, RomanceTemplateId } from "./romance";

/**
 * Pack plans for the French and Spanish generated content.
 *
 * Each pack drills ONE verb. The first plan paired two verbs per pack, and
 * measuring it showed only about 31% of the distractors were forms of the
 * line's own verb (bank-engine pools a pack's answers, so the rest were other
 * verbs, which tests vocabulary rather than conjugation). One verb makes
 * every wrong option another person's form of the same verb. The gate allows
 * up to two verbs but holds a floor on the measured share.
 *
 * Generated pack ids start with "frg" / "esg"; the duplicate-prompt gate and
 * this file's own duplicate filter ignore packs with those prefixes so they do
 * not collide with themselves once applied.
 */
export const GENERATED_PACK_PREFIX = { fr: "frg", es: "esg" } as const;

export type RomancePackSpec = {
  id: string;
  lang: "fr" | "es";
  level: Level;
  template: RomanceTemplateId;
  verbs: string[];
  /** Restrict objects to nouns carrying at least one of these classes. */
  nounClasses?: NounClass[];
  title: string;
  subtitle: string;
  note: string;
  count: number;
};

// Learner-facing: the unit description is "<subtitle> — <note>" and the
// explanation after an answer ends with the note, so both read as plain copy.
const NOTE = {
  present: "Choose the verb form that matches the subject.",
  frPc: "The auxiliary and the participle go together.",
  frEtre: "The participle agrees with the subject.",
  preterite: "Choose the past form that matches the subject.",
};
const SUBTITLE = {
  present: "Present tense in short sentences",
  frPc: "Passé composé in short sentences",
  preterite: "Preterite in short sentences",
};

function spec(
  id: string,
  lang: "fr" | "es",
  level: Level,
  template: RomanceTemplateId,
  verb: string,
  title: string,
  kind: "present" | "past",
  note: string,
  nounClasses?: NounClass[],
): RomancePackSpec {
  return {
    id,
    lang,
    level,
    template,
    verbs: [verb],
    nounClasses,
    title,
    subtitle:
      kind === "present"
        ? SUBTITLE.present
        : template === "es-svo-preterite"
          ? SUBTITLE.preterite
          : SUBTITLE.frPc,
    note,
    count: 15,
  };
}

export const ROMANCE_PACK_SPECS: RomancePackSpec[] = [
  // --- French present (A2)
  spec(
    "frga2p1",
    "fr",
    "A2",
    "fr-svo-present",
    "manger",
    "Sentences: Eating",
    "present",
    NOTE.present,
    ["food-count", "food-mass"],
  ),
  spec(
    "frga2p2",
    "fr",
    "A2",
    "fr-svo-present",
    "boire",
    "Sentences: Drinking",
    "present",
    NOTE.present,
    ["drink"],
  ),
  spec(
    "frga2p3",
    "fr",
    "A2",
    "fr-svo-present",
    "porter",
    "Sentences: Wearing Clothes",
    "present",
    NOTE.present,
    ["clothing"],
  ),
  spec(
    "frga2p4",
    "fr",
    "A2",
    "fr-svo-present",
    "acheter",
    "Sentences: Buying Things",
    "present",
    NOTE.present,
    ["school-object", "household-object", "readable", "clothing"],
  ),
  spec(
    "frga2p5",
    "fr",
    "A2",
    "fr-svo-present",
    "voir",
    "Sentences: Seeing Animals and Vehicles",
    "present",
    NOTE.present,
    ["animal", "vehicle"],
  ),
  spec(
    "frga2p6",
    "fr",
    "A2",
    "fr-svo-present",
    "lire",
    "Sentences: Reading",
    "present",
    NOTE.present,
    ["readable"],
  ),
  // --- French passé composé (B1)
  spec("frgb1p1", "fr", "B1", "fr-svo-pc", "manger", "Yesterday: Eating", "past", NOTE.frPc, [
    "food-count",
    "food-mass",
  ]),
  spec(
    "frgb1p2",
    "fr",
    "B1",
    "fr-svo-pc",
    "acheter",
    "Yesterday: Buying Things",
    "past",
    NOTE.frPc,
    ["school-object", "household-object", "readable", "clothing"],
  ),
  spec(
    "frgb1p3",
    "fr",
    "B1",
    "fr-etre-pc",
    "aller",
    "Yesterday: Going Places",
    "past",
    NOTE.frEtre,
  ),
  spec(
    "frgb1p4",
    "fr",
    "B1",
    "fr-etre-pc",
    "venir",
    "Yesterday: Coming From Places",
    "past",
    NOTE.frEtre,
  ),
  spec("frgb1p5", "fr", "B1", "fr-etre-pc", "arriver", "Yesterday: Arriving", "past", NOTE.frEtre),
  spec("frgb1p6", "fr", "B1", "fr-etre-pc", "rester", "Yesterday: Staying", "past", NOTE.frEtre),
  // --- Spanish present (A2)
  spec(
    "esga2p1",
    "es",
    "A2",
    "es-svo-present",
    "comer",
    "Sentences: Eating",
    "present",
    NOTE.present,
    ["food-count", "food-mass"],
  ),
  spec(
    "esga2p2",
    "es",
    "A2",
    "es-svo-present",
    "beber",
    "Sentences: Drinking",
    "present",
    NOTE.present,
    ["drink"],
  ),
  spec(
    "esga2p3",
    "es",
    "A2",
    "es-svo-present",
    "comprar",
    "Sentences: Buying Things",
    "present",
    NOTE.present,
    ["clothing", "school-object"],
  ),
  spec(
    "esga2p4",
    "es",
    "A2",
    "es-svo-present",
    "ver",
    "Sentences: Seeing Animals",
    "present",
    NOTE.present,
    ["animal"],
  ),
  spec(
    "esga2p5",
    "es",
    "A2",
    "es-svo-present",
    "leer",
    "Sentences: Reading",
    "present",
    NOTE.present,
    ["readable"],
  ),
  spec(
    "esga2p6",
    "es",
    "A2",
    "es-svo-present",
    "tener",
    "Sentences: Having Things",
    "present",
    NOTE.present,
    ["household-object", "school-object", "animal"],
  ),
  // --- Spanish preterite (A2)
  spec(
    "esga2p7",
    "es",
    "A2",
    "es-svo-preterite",
    "comer",
    "Yesterday: Eating",
    "past",
    NOTE.preterite,
    ["food-count", "food-mass"],
  ),
  spec(
    "esga2p8",
    "es",
    "A2",
    "es-svo-preterite",
    "comprar",
    "Yesterday: Buying Things",
    "past",
    NOTE.preterite,
    ["clothing", "school-object"],
  ),
  spec(
    "esga2p9",
    "es",
    "A2",
    "es-svo-preterite",
    "ver",
    "Yesterday: Seeing Animals",
    "past",
    NOTE.preterite,
    ["animal"],
  ),
];

function objectClasses(item: GeneratedItem): NounClass[] {
  const pool = item.lang === "fr" ? FR_NOUNS : ES_NOUNS;
  return pool.find((n) => n.key === item.object)?.classes ?? [];
}

/** Prompts already in the course (generated packs excluded), normalised. */
const existingCache = new Map<string, Set<string>>();
export function existingPrompts(lang: "fr" | "es"): Set<string> {
  const cached = existingCache.get(lang);
  if (cached) return cached;
  const bank = lang === "fr" ? BANK_FR : BANK_ES;
  const set = new Set<string>();
  for (const pack of Object.values(bank).flat()) {
    if (pack.id.startsWith(GENERATED_PACK_PREFIX[lang])) continue;
    for (const q of packQuestions(pack)) set.add(normaliseWritten(q.prompt));
  }
  existingCache.set(lang, set);
  return set;
}

/** The prompt with the verb hint removed: two items with the same key would read alike. */
function promptKey(item: GeneratedItem): string {
  return item.prompt.replace(/ \([^)]*\)/, "");
}

/** Every item a spec could emit, before sampling, minus prompts the course already has. */
export function specCandidates(spec: RomancePackSpec): GeneratedItem[] {
  const gen = spec.lang === "fr" ? frCandidates : esCandidates;
  const existing = existingPrompts(spec.lang);
  return spec.verbs
    .flatMap((verb) => gen(spec.template, verb))
    .filter(
      (item) =>
        !spec.nounClasses ||
        item.template === "fr-etre-pc" ||
        objectClasses(item).some((c) => spec.nounClasses!.includes(c)),
    )
    .filter((item) => !existing.has(normaliseWritten(item.prompt)));
}

function lexLess(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i]! !== b[i]!) return a[i]! < b[i]!;
  }
  return false;
}

/**
 * Deterministic balanced selection of `count` items. Lexicographic: fewest
 * uses of the verb, then the subject, then the object, then the article kind,
 * then a hash tie-break. Never emits two lines with the same prompt text.
 */
function selectCount(
  spec: RomancePackSpec,
  pool: GeneratedItem[],
  count: number,
  salt: number,
): GeneratedItem[] {
  const chosen: GeneratedItem[] = [];
  const used = new Set<string>();
  const uses = (field: (i: GeneratedItem) => string, value: string) =>
    chosen.filter((c) => field(c) === value).length;
  while (chosen.length < count) {
    let best: { item: GeneratedItem; score: number[] } | null = null;
    for (const item of pool) {
      if (used.has(promptKey(item))) continue;
      const score = [
        uses((i) => i.verb, item.verb),
        uses((i) => i.subject, item.subject),
        uses((i) => i.object, item.object),
        uses((i) => i.articleKind, item.articleKind),
        hash(`${spec.id}:${salt}:${item.line}`),
      ];
      if (!best || lexLess(score, best.score)) best = { item, score };
    }
    if (!best) break;
    chosen.push(best.item);
    used.add(promptKey(best.item));
  }
  return chosen;
}

function asPack(spec: RomancePackSpec, items: GeneratedItem[]): Pack {
  return {
    id: spec.id,
    title: spec.title,
    subtitle: spec.subtitle,
    kind: "cloze",
    note: spec.note,
    data: items.map((i) => i.line).join("\n"),
  };
}

/** True when every question can offer three DISTINCT wrong options. */
function hasThreeDistractors(pack: Pack): boolean {
  return packQuestions(pack).every((q) => {
    if (q.type === "mc") return q.choices.length === 4;
    if (q.type === "fill") return q.bank.length === 4;
    return false;
  });
}

/**
 * bank-engine's distractor walk steps through the pool 7 at a time, so a pool
 * whose size is a multiple of 7 revisits the same few candidates and a
 * question can end up with fewer than three wrong options. The engine is
 * shared and unchanged, so the generator varies WHICH sentences it picks (a
 * salt in the tie-break) until the pack works. Lessons are five questions, so
 * only multiples of five are accepted: the requested count first, then half.
 */
const SALTS = 60;
export function buildRomancePack(spec: RomancePackSpec): { pack: Pack; items: GeneratedItem[] } {
  const pool = specCandidates(spec);
  for (const count of [spec.count, spec.count - 5]) {
    for (let salt = 0; salt < SALTS; salt++) {
      const items = selectCount(spec, pool, count, salt);
      if (items.length !== count) break;
      const pack = asPack(spec, items);
      if (hasThreeDistractors(pack)) return { pack, items };
    }
  }
  throw new Error(
    `${spec.id}: no multiple-of-five pack gives every question three distinct wrong options`,
  );
}

export function levelOf(spec: RomancePackSpec): Level {
  return spec.level;
}
