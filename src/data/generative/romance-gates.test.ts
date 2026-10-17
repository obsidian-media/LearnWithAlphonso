import { describe, expect, it } from "vitest";
import { packQuestions } from "../bank-engine";
import type { Question } from "../curriculum";
import { hasErrors, validatePack } from "../../lib/pack-authoring";
import { deriveAnswerCorrectness } from "../../lib/srs";
import { normaliseWritten } from "../../lib/translation-answer";
import { esDefects } from "./es-check";
import { ES_NOUNS, ES_VERBS } from "./es-data";
import { esCandidates } from "./es-compile";
import { frDefects } from "./fr-check";
import { FR_AVOIR_PRESENT, FR_ETRE_PRESENT, FR_NOUNS, FR_VERBS } from "./fr-data";
import { frCandidates } from "./fr-compile";
import { BANK_ES } from "../lesson-bank-es";
import { BANK_FR } from "../lesson-bank-fr";
import { allPacks } from "./romance-bank.testutil";
import { ROMANCE_PACK_SPECS, buildRomancePack, specCandidates } from "./romance-packs";
import { completeSentence, type GeneratedItem, type Noun } from "./romance";

/**
 * Gates 2-7 on the COMPILED content. Every expectation below is written out
 * by hand in this file (article text rules, allowed classes, forbidden pairs,
 * place phrases) rather than read back from the tables the compiler uses, so
 * a table edit cannot quietly change what the gate expects.
 */

const built = ROMANCE_PACK_SPECS.map((spec) => {
  const { pack, items } = buildRomancePack(spec);
  return { spec, pack, items, questions: packQuestions(pack) };
});

function choicesOf(q: Question): string[] {
  if (q.type === "mc") return q.choices;
  if (q.type === "fill") return q.bank;
  throw new Error(`unexpected question type ${q.type}`);
}
function answerOf(q: Question): string {
  if (q.type === "mc") return q.choices[q.answer]!;
  if (q.type === "fill") return q.answer;
  throw new Error(`unexpected question type ${q.type}`);
}
const nounOf = (item: GeneratedItem): Noun | undefined =>
  (item.lang === "fr" ? FR_NOUNS : ES_NOUNS).find((n) => n.key === item.object);

describe("the packs themselves", () => {
  it("every spec produces a valid, deterministic cloze pack whose size is a multiple of five", () => {
    for (const { spec, pack, items } of built) {
      expect(hasErrors(validatePack(pack)), spec.id).toBe(false);
      // Lessons are five questions: a 14-question pack leaves a 4-question lesson.
      expect(items.length % 5, spec.id).toBe(0);
      expect(items.length, spec.id).toBeGreaterThanOrEqual(10);
      expect(items.length, spec.id).toBeLessThanOrEqual(spec.count);
      expect(buildRomancePack(spec).pack.data, spec.id).toBe(pack.data);
    }
  });

  it("each pack uses at most two verbs and every subject of its template", () => {
    for (const { spec, items } of built) {
      expect(new Set(items.map((i) => i.verb)).size, spec.id).toBeLessThanOrEqual(2);
      const subjects = new Set(items.map((i) => i.subject));
      expect(subjects.size, spec.id).toBeGreaterThanOrEqual(spec.template === "fr-etre-pc" ? 4 : 6);
    }
  });
});

/** Singular entries that read naturally only as a plural indefinite after manger. */
const PLURAL_ONLY_IN_USE = new Set(["légume"]);

describe("gate 2: agreement, countability and article kind (read off the rendered text)", () => {
  it("French articles match the noun's gender, number and countability", () => {
    for (const { items } of built)
      for (const item of items) {
        if (item.lang !== "fr" || item.articleKind === "place") continue;
        const noun = nounOf(item)!;
        const np = item.prompt.split(") ")[1]!.replace(/\.$/, "");
        const partitive = /^(du|de la|de l'|des) /.test(np) || /^de l'/.test(np);
        if (!noun.count) {
          expect(partitive, `${item.prompt}: mass noun needs the partitive`).toBe(true);
        } else if (noun.number === "s" && !PLURAL_ONLY_IN_USE.has(noun.key)) {
          expect(partitive, `${item.prompt}: count noun must not take the partitive`).toBe(false);
        }
        if (noun.number === "p") {
          expect(np, item.prompt).toMatch(new RegExp(`^(les|des) ${noun.key}$`));
        } else if (PLURAL_ONLY_IN_USE.has(noun.key) && item.verb === "manger") {
          // "un légume" is not idiomatic: written out by hand, the plural is the only form.
          expect(np, item.prompt).toBe(`des ${noun.key}s`);
        } else if (noun.gender === "m") {
          expect(np, item.prompt).toMatch(new RegExp(`^(le|l'|un|du|de l') ?${noun.key}$`));
        } else {
          expect(np, item.prompt).toMatch(new RegExp(`^(la|l'|une|de la|de l') ?${noun.key}$`));
        }
      }
  });

  it("Spanish mass nouns are bare, singular nouns take a matching article, animals are indefinite", () => {
    for (const { items } of built)
      for (const item of items) {
        if (item.lang !== "es") continue;
        const noun = nounOf(item)!;
        const np = item.prompt.split(") ")[1]!.replace(/\.$/, "");
        if (!noun.count) {
          expect(np, `${item.prompt}: mass noun must be bare`).toBe(noun.key);
        } else if (noun.number === "p") {
          const m = noun.gender === "m";
          expect(np, item.prompt).toMatch(
            new RegExp(`^(${m ? "los|unos" : "las|unas"}) ${noun.key}$`),
          );
        } else {
          const m = noun.gender === "m";
          expect(np, item.prompt).toMatch(new RegExp(`^(${m ? "el|un" : "la|una"}) ${noun.key}$`));
        }
        if (noun.classes.includes("animal")) {
          expect(np, `${item.prompt}: animals take the indefinite only`).toMatch(
            new RegExp(`^(un|una) ${noun.key}$`),
          );
        }
      }
  });

  // Hand-written copy of section 5.3 of the design: the article kinds each
  // (verb, class) may take. The compiler's own table must stay inside it.
  const KINDS: Record<string, Record<string, string[]>> = {
    manger: { "food-count": ["indefinite", "definite"], "food-mass": ["partitive"] },
    cuisiner: { "food-count": ["indefinite"], "food-mass": ["partitive"] },
    boire: { drink: ["partitive"] },
    prendre: { drink: ["partitive"] },
    porter: { clothing: ["indefinite", "definite"] },
    mettre: { clothing: ["indefinite", "definite"] },
    acheter: {
      clothing: ["indefinite", "definite"],
      "school-object": ["indefinite", "definite"],
      "household-object": ["indefinite", "definite"],
      readable: ["indefinite", "definite"],
    },
    ouvrir: { openable: ["definite"] },
    voir: { watchable: ["indefinite", "definite"] },
    regarder: { watchable: ["indefinite", "definite"] },
    lire: { readable: ["indefinite", "definite"] },
    choisir: { readable: ["indefinite", "definite"], "school-object": ["indefinite", "definite"] },
    comer: { "food-count": ["indefinite"], "food-mass": ["bare"] },
    preparar: { "food-mass": ["bare"] },
    beber: { drink: ["bare"] },
    tomar: { drink: ["bare"] },
    comprar: {
      clothing: ["indefinite"],
      "school-object": ["indefinite"],
      "household-object": ["indefinite"],
    },
    buscar: {
      clothing: ["definite"],
      "school-object": ["definite"],
      "household-object": ["definite"],
    },
    ver: { animal: ["indefinite"] },
    mirar: { animal: ["indefinite"] },
    leer: { readable: ["indefinite", "definite"] },
    abrir: { openable: ["definite"] },
    tener: {
      animal: ["indefinite"],
      "household-object": ["indefinite"],
      "school-object": ["indefinite"],
    },
    querer: {
      animal: ["indefinite"],
      "household-object": ["indefinite"],
      "school-object": ["indefinite"],
    },
  };

  it("every verb's allowlist stays inside the hand-written article matrix, and no 'avoir/tener + definite' exists", () => {
    for (const v of [...FR_VERBS.filter((x) => x.uses), ...ES_VERBS]) {
      const allowed = KINDS[v.inf];
      expect(allowed, `${v.inf} missing from the gate's matrix`).toBeDefined();
      for (const use of v.uses!) {
        expect(allowed![use.cls], `${v.inf} + ${use.cls}`).toBeDefined();
        for (const kind of use.kinds)
          expect(allowed![use.cls], `${v.inf} + ${use.cls} + ${kind}`).toContain(kind);
      }
    }
    for (const inf of ["tener", "querer"])
      for (const use of ES_VERBS.find((v) => v.inf === inf)!.uses)
        expect(use.kinds, `${inf} + ${use.cls}`).toEqual(["indefinite"]);
  });
});

/** Hand-written place phrases per verb, section 4.1 of the design. */
const PLACE_PHRASES: Record<string, string[]> = {
  aller: [
    "à l'école",
    "au marché",
    "au magasin",
    "au supermarché",
    "à la bibliothèque",
    "au parc",
    "à la gare",
    "au cinéma",
    "au théâtre",
    "à l'aéroport",
  ],
  venir: [
    "de l'école",
    "du marché",
    "du magasin",
    "du supermarché",
    "de la bibliothèque",
    "du parc",
    "de la gare",
  ],
  arriver: [
    "à la gare",
    "à l'aéroport",
    "à l'école",
    "à la bibliothèque",
    "au magasin",
    "au supermarché",
    "au parc",
  ],
  rester: ["à la maison", "à l'école", "à la bibliothèque", "au parc"],
  rentrer: ["à la maison", "à l'école"],
};

describe("gate 3: passé composé", () => {
  const etre = built.flatMap((b) => b.items).filter((i) => i.template === "fr-etre-pc");
  const avoir = built.flatMap((b) => b.items).filter((i) => i.template === "fr-svo-pc");

  it("être sentences use only il/elle/ils/elles, an allowlisted phrase, and the agreeing participle", () => {
    expect(etre.length).toBeGreaterThan(20);
    for (const item of etre) {
      expect(["il", "elle", "ils", "elles"], item.prompt).toContain(item.subject);
      const phrase = /\) (.*)\.$/.exec(item.prompt)![1]!;
      expect(PLACE_PHRASES[item.verb], item.prompt).toContain(phrase);
      const [aux, participle] = item.answer.split(" ") as [string, string];
      const plural = item.subject === "ils" || item.subject === "elles";
      const feminine = item.subject === "elle" || item.subject === "elles";
      expect(aux, item.prompt).toBe(plural ? "sont" : "est");
      if (!plural && !feminine) expect(participle).toMatch(/[éui]$/);
      if (!plural && feminine) expect(participle).toMatch(/e$/);
      if (plural && !feminine) expect(participle).toMatch(/[éui]s$/);
      if (plural && feminine) expect(participle).toMatch(/es$/);
    }
  });

  it("avoir sentences never use je and take the avoir auxiliary", () => {
    expect(avoir.length).toBeGreaterThan(20);
    for (const item of avoir) {
      expect(item.subject, item.prompt).not.toBe("je");
      expect(FR_AVOIR_PRESENT, item.prompt).toContain(item.answer.split(" ")[0]);
      expect(FR_ETRE_PRESENT, item.prompt).not.toContain(item.answer.split(" ")[0]);
    }
  });

  it("a dual-auxiliary verb is never given an object in any template", () => {
    for (const v of FR_VERBS.filter((x) => x.intransitiveOnly))
      for (const t of ["fr-svo-present", "fr-svo-pc"] as const)
        expect(frCandidates(t, v.inf)).toEqual([]);
  });

  it("every être phrase of the verb table is one of the hand-written ones", () => {
    for (const v of FR_VERBS.filter((x) => x.aux === "etre"))
      for (const item of frCandidates("fr-etre-pc", v.inf)) {
        const phrase = /\) (.*)\.$/.exec(item.prompt)![1]!;
        expect(PLACE_PHRASES[v.inf], item.prompt).toContain(phrase);
      }
  });
});

describe("gate 4: elision, contraction and typography on the COMPLETED sentence, for every choice", () => {
  it("the answer and every distractor complete to a defect-free sentence", () => {
    let checked = 0;
    for (const { spec, questions, items } of built)
      questions.forEach((q, i) => {
        const item = items[i]!;
        for (const choice of choicesOf(q)) {
          const sentence = completeSentence(q.prompt, choice);
          const defects = spec.lang === "fr" ? frDefects(sentence) : esDefects(sentence);
          expect(defects, `${spec.id}: "${sentence}" (answer ${item.answer})`).toEqual([]);
          checked++;
        }
      });
    expect(checked).toBeGreaterThan(900);
  });

  it("je is never paired with a vowel or mute-h verb, and French present packs are all-consonant or all-vowel", () => {
    for (const { spec, items } of built) {
      if (spec.lang !== "fr") continue;
      if (spec.template === "fr-svo-present") {
        const flags = spec.verbs.map((v) => /^[aeiouhéèêàâîôû]/i.test(v));
        expect(new Set(flags).size, `${spec.id} mixes vowel and consonant verbs`).toBe(1);
      }
      for (const item of items)
        if (item.subject === "je") {
          expect(item.template, item.prompt).toBe("fr-svo-present");
          expect(/^[aeiouhéèêàâîôû]/i.test(item.verb), item.prompt).toBe(false);
        }
    }
  });
});

/** Every valid spelling for a line, rebuilt from the tables (not from compile code). */
function validForms(item: GeneratedItem): Set<string> {
  const p = item.person;
  const forms = new Set<string>();
  if (item.lang === "es") {
    const v = ES_VERBS.find((x) => x.inf === item.verb)!;
    forms.add((item.tense === "past" ? v.preterite! : v.present)[p]);
    (v.presentAlt?.[p] ?? []).forEach((f) => forms.add(f));
    return forms;
  }
  const v = FR_VERBS.find((x) => x.inf === item.verb)!;
  if (item.template === "fr-svo-present") {
    forms.add(v.present[p]);
    (v.presentAlt?.[p] ?? []).forEach((f) => forms.add(f));
  } else if (item.template === "fr-svo-pc") {
    forms.add(`${FR_AVOIR_PRESENT[p]} ${v.participle}`);
  } else {
    const key =
      `${item.subject === "elle" || item.subject === "elles" ? "f" : "m"}${p === 5 ? "p" : "s"}` as "ms";
    forms.add(v.pcEtre![key]);
  }
  return forms;
}

describe("gate 5: the course's own checker accepts the answer and no distractor is a correct form", () => {
  it("accepts the intended answer", () => {
    for (const { spec, questions, items } of built)
      questions.forEach((q, i) => {
        expect(deriveAnswerCorrectness(q, items[i]!.answer, spec.lang), q.prompt).toBe(true);
        expect(q.prompt, spec.id).toBe(items[i]!.prompt);
        expect(answerOf(q)).toBe(items[i]!.answer);
      });
  });

  it("rejects every wrong option, and none is a valid form for that line's subject, verb and tense", () => {
    let distractors = 0;
    for (const { spec, questions, items } of built)
      questions.forEach((q, i) => {
        const item = items[i]!;
        const valid = new Set([...validForms(item)].map((f) => f.toLowerCase()));
        expect(valid.has(item.answer.toLowerCase()), item.prompt).toBe(true);
        const wrong = choicesOf(q).filter((c) => c !== answerOf(q));
        expect(wrong.length, q.prompt).toBe(3);
        for (const d of wrong) {
          expect(deriveAnswerCorrectness(q, d, spec.lang), `${q.prompt} / ${d}`).toBe(false);
          expect(valid.has(d.toLowerCase()), `${q.prompt}: "${d}" is a correct form`).toBe(false);
          expect(normaliseWritten(d), `${q.prompt}: "${d}" is the answer minus accents`).not.toBe(
            normaliseWritten(item.answer),
          );
          distractors++;
        }
      });
    expect(distractors).toBeGreaterThan(300);
  });
});

/** Every form of the line's verb in the line's tense, rebuilt from the tables. */
function formsOfVerb(item: GeneratedItem): Set<string> {
  const out = new Set<string>();
  if (item.lang === "es") {
    const v = ES_VERBS.find((x) => x.inf === item.verb)!;
    (item.tense === "past" ? v.preterite! : v.present).forEach((f) => out.add(f.toLowerCase()));
    return out;
  }
  const v = FR_VERBS.find((x) => x.inf === item.verb)!;
  if (item.template === "fr-svo-present") v.present.forEach((f) => out.add(f.toLowerCase()));
  else if (item.template === "fr-svo-pc")
    FR_AVOIR_PRESENT.forEach((a) => out.add(`${a} ${v.participle}`.toLowerCase()));
  else Object.values(v.pcEtre!).forEach((f) => out.add(f.toLowerCase()));
  return out;
}

/** Floor, not a pinned count: the share of distractors that are forms of the line's own verb. */
const SAME_VERB_FLOOR = 0.4;

describe("gate 6: no duplicate prompts, and a real same-verb share", () => {
  const existing = {
    fr: new Set(
      allPacks("fr").flatMap((p) => packQuestions(p).map((q) => normaliseWritten(q.prompt))),
    ),
    es: new Set(
      allPacks("es").flatMap((p) => packQuestions(p).map((q) => normaliseWritten(q.prompt))),
    ),
  };

  it("no generated prompt repeats an existing question, or another generated one", () => {
    const seen = new Set<string>();
    for (const { spec, questions } of built)
      for (const q of questions) {
        const key = `${spec.lang}:${normaliseWritten(q.prompt)}`;
        expect(
          existing[spec.lang].has(normaliseWritten(q.prompt)),
          `${q.prompt} already exists`,
        ).toBe(false);
        expect(seen.has(key), `${q.prompt} repeated`).toBe(false);
        seen.add(key);
      }
  });

  it(`at least ${SAME_VERB_FLOOR * 100}% of each pack's distractors are forms of the line's own verb`, () => {
    for (const { spec, questions, items } of built) {
      let same = 0;
      let total = 0;
      questions.forEach((q, i) => {
        const forms = formsOfVerb(items[i]!);
        for (const d of choicesOf(q).filter((c) => c !== answerOf(q))) {
          total++;
          if (forms.has(d.toLowerCase())) same++;
        }
      });
      expect(same / total, `${spec.id}: ${same}/${total}`).toBeGreaterThanOrEqual(SAME_VERB_FLOOR);
    }
  });
});

/** Hand-written, per language: the classes each verb may take (design section 6). */
const ALLOWED_CLASSES: Record<string, string[]> = {
  manger: ["food-count", "food-mass"],
  cuisiner: ["food-count", "food-mass"],
  boire: ["drink"],
  prendre: ["drink"],
  porter: ["clothing"],
  mettre: ["clothing"],
  acheter: ["clothing", "school-object", "household-object", "readable"],
  ouvrir: ["openable"],
  voir: ["watchable"],
  regarder: ["watchable"],
  lire: ["readable"],
  choisir: ["readable", "school-object"],
  comer: ["food-count", "food-mass"],
  preparar: ["food-mass"],
  beber: ["drink"],
  tomar: ["drink"],
  comprar: ["clothing", "school-object", "household-object"],
  buscar: ["clothing", "school-object", "household-object"],
  ver: ["animal"],
  mirar: ["animal"],
  leer: ["readable"],
  abrir: ["openable"],
  tener: ["animal", "household-object", "school-object"],
  querer: ["animal", "household-object", "school-object"],
};

/** Pairs a person would call nonsense. None may be generated, from ANY expansion. */
const FORBIDDEN: [string, string][] = [
  ["regarder", "crayon"],
  ["regarder", "table"],
  ["voir", "stylo"],
  ["manger", "chaise"],
  ["manger", "livre"],
  ["boire", "pomme"],
  ["boire", "pain"],
  ["mettre", "pomme"],
  ["mettre", "pain"],
  ["mettre", "livre"],
  ["lire", "chien"],
  ["lire", "pain"],
  ["porter", "gâteau"],
  ["porter", "chien"],
  ["ouvrir", "pomme"],
  ["ouvrir", "chien"],
  ["acheter", "chien"],
  ["acheter", "clé"],
  ["manger", "beurre"],
  ["cuisiner", "beurre"],
  ["cuisiner", "chaise"],
  ["comer", "silla"],
  ["comer", "libro"],
  ["beber", "manzana"],
  ["ver", "mesa"],
  ["ver", "lápiz"],
  ["mirar", "pan"],
  ["leer", "perro"],
  ["leer", "pan"],
  ["abrir", "leche"],
  ["abrir", "perro"],
  ["comprar", "perro"],
  ["tener", "pan"],
  ["querer", "leche"],
  ["preparar", "libro"],
  // doors and windows are not bought or owned
  ["acheter", "fenêtre"],
  ["acheter", "porte"],
  ["tener", "puerta"],
  ["tener", "ventana"],
  ["comprar", "puerta"],
  ["comprar", "ventana"],
  ["buscar", "puerta"],
  // not eaten whole
  ["comer", "cebolla"],
  ["comer", "limón"],
  // pets only
  ["tener", "elefante"],
  ["tener", "tigre"],
  ["querer", "oso"],
];

/** (verb, tense) uses that change meaning and must never be generated. */
const FORBIDDEN_TENSE: [string, "past"][] = [
  ["tener", "past"],
  ["querer", "past"],
];

describe("gate 7: the meaning allowlist", () => {
  const everything: GeneratedItem[] = [
    ...FR_VERBS.flatMap((v) =>
      (["fr-svo-present", "fr-svo-pc", "fr-etre-pc"] as const).flatMap((t) =>
        frCandidates(t, v.inf),
      ),
    ),
    ...ES_VERBS.flatMap((v) =>
      (["es-svo-present", "es-svo-preterite"] as const).flatMap((t) => esCandidates(t, v.inf)),
    ),
  ];

  it("no forbidden (verb, noun) pair is generated by any expansion", () => {
    expect(everything.length).toBeGreaterThan(1000);
    for (const [verb, noun] of FORBIDDEN)
      expect(
        everything.filter((i) => i.verb === verb && i.object === noun).map((i) => i.prompt),
        `${verb} + ${noun}`,
      ).toEqual([]);
  });

  it("tener and querer are never used in the preterite", () => {
    for (const [verb, tense] of FORBIDDEN_TENSE)
      expect(
        everything.filter((i) => i.verb === verb && i.tense === tense).map((i) => i.prompt),
        verb,
      ).toEqual([]);
    expect(esCandidates("es-svo-preterite", "tener")).toEqual([]);
    expect(esCandidates("es-svo-preterite", "querer")).toEqual([]);
    expect(esCandidates("es-svo-present", "tener").length).toBeGreaterThan(0);
  });

  it("manger takes the indefinite only for fruit, and only the plural for légume", () => {
    for (const item of everything.filter((i) => i.verb === "manger" && i.object === "fruit"))
      expect(item.prompt, item.prompt).toMatch(/ un fruit\.$/);
    const veg = everything.filter((i) => i.verb === "manger" && i.object === "légume");
    expect(veg.length).toBeGreaterThan(0);
    for (const item of veg) expect(item.prompt, item.prompt).toMatch(/ des légumes\.$/);
  });

  it("every generated (verb, object) is inside the hand-written class list, and mettre takes clothing only", () => {
    for (const item of everything) {
      if (item.template === "fr-etre-pc") continue;
      const noun = nounOf(item)!;
      const allowed = ALLOWED_CLASSES[item.verb];
      expect(allowed, `${item.verb} missing from the gate`).toBeDefined();
      expect(
        noun.classes.some((c) => allowed!.includes(c)),
        `${item.prompt}`,
      ).toBe(true);
      if (item.verb === "mettre") expect(noun.classes, item.prompt).toContain("clothing");
    }
  });

  it("every verb has a non-empty allowlist and every noun belongs to at least one class", () => {
    for (const v of [...FR_VERBS.filter((x) => x.aux === "avoir"), ...ES_VERBS])
      expect(v.uses!.length, v.inf).toBeGreaterThan(0);
    for (const n of [...FR_NOUNS, ...ES_NOUNS]) expect(n.classes.length, n.key).toBeGreaterThan(0);
  });

  it("the spec candidates never leave the spec's own verbs", () => {
    for (const spec of ROMANCE_PACK_SPECS)
      for (const item of specCandidates(spec)) expect(spec.verbs).toContain(item.verb);
  });
});

describe("the applied packs are exactly what the plan generates", () => {
  it("every planned pack is in its course bank at its level, with the generated lines", () => {
    for (const { spec, pack } of built) {
      const bank = spec.lang === "fr" ? BANK_FR : BANK_ES;
      const found = bank[spec.level].find((p) => p.id === spec.id);
      expect(found, `${spec.id} missing from the ${spec.lang} ${spec.level} bank`).toBeDefined();
      expect(found!.data, `${spec.id} was edited after generation`).toBe(pack.data);
      expect(found!.title).toBe(pack.title);
      expect(found!.kind).toBe("cloze");
    }
  });

  it("no generated pack sits in the bank without a plan", () => {
    const planned = new Set(ROMANCE_PACK_SPECS.map((s) => s.id));
    for (const [prefix, bank] of [
      ["frg", BANK_FR],
      ["esg", BANK_ES],
    ] as const)
      for (const pack of Object.values(bank).flat())
        if (pack.id.startsWith(prefix)) expect(planned.has(pack.id), pack.id).toBe(true);
  });
});
