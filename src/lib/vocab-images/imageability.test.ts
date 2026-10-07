import { describe, expect, it } from "vitest";
import {
  IMAGEABILITY_DATA,
  classifyImageability,
  lookupForm,
  validateImageabilityData,
  type ImageabilityData,
} from "./imageability";
import { FLAGGED_TERMS_2026_10_07 } from "./flagged";
import { IMAGE_LANGS } from "./types";

const FIXTURE: ImageabilityData = {
  version: 1,
  imageable: {
    en: { noun: ["doctor"], action: ["swimming"], place: ["kitchen"], food: ["apple"] },
    fr: { noun: [], action: [], place: ["école"], food: ["pomme", "pain"] },
    es: { noun: ["perro"], action: [], place: ["playa"], food: [] },
  },
  queries: {
    en: { swimming: "child swimming lesson" },
    fr: { école: "school", pomme: "apple", pain: "bread" },
    es: { playa: "beach" },
  },
  deny: { en: ["risk", "a chance"], fr: ["de rien"], es: [] },
  functionWords: { en: ["the", "a"], fr: ["le"], es: ["de"] },
};

const reason = (term: string, lang: "en" | "fr" | "es") => {
  const r = classifyImageability(term, lang, FIXTURE);
  return r.imageable ? `imageable:${r.category}:${r.query}` : r.reason;
};

describe("lookupForm", () => {
  it("strips one leading article per language and normalises apostrophes", () => {
    expect(lookupForm("The Apple", "en")).toBe("apple");
    expect(lookupForm("la pomme", "fr")).toBe("pomme");
    expect(lookupForm("L’école", "fr")).toBe("école");
    expect(lookupForm("de l'eau", "fr")).toBe("eau");
    expect(lookupForm("el perro", "es")).toBe("perro");
  });
});

describe("classifyImageability", () => {
  it("English: concrete allowlisted terms, with an optional query override", () => {
    expect(reason("the apple", "en")).toBe("imageable:food:apple");
    expect(reason("Doctor", "en")).toBe("imageable:noun:doctor");
    expect(reason("swimming", "en")).toBe("imageable:action:child swimming lesson");
  });

  it("English: everything else is not imageable, with the rule that decided", () => {
    expect(reason("", "en")).toBe("empty");
    expect(reason("Is this okay?", "en")).toBe("phrase");
    expect(reason("one two three four", "en")).toBe("phrase");
    expect(reason("couldn't", "en")).toBe("contraction");
    expect(reason("it's", "en")).toBe("contraction");
    expect(reason("risk", "en")).toBe("denied");
    expect(reason("a chance", "en")).toBe("denied");
    expect(reason("the", "en")).toBe("function-word");
    expect(reason("freedom", "en")).toBe("not-listed");
  });

  it("French: articles, elisions and the English query", () => {
    expect(reason("la pomme", "fr")).toBe("imageable:food:apple");
    expect(reason("l'école", "fr")).toBe("imageable:place:school");
    expect(reason("d'accord", "fr")).toBe("contraction");
    expect(reason("de rien", "fr")).toBe("denied");
    expect(reason("le", "fr")).toBe("function-word");
    expect(reason("essayait", "fr")).toBe("not-listed");
  });

  it("Spanish: a listed term without a query is not imageable", () => {
    expect(reason("la playa", "es")).toBe("imageable:place:beach");
    expect(reason("el perro", "es")).toBe("no-query");
    expect(reason("de", "es")).toBe("function-word");
  });

  it("is per language: a French food is not an English one", () => {
    expect(reason("pain", "fr")).toBe("imageable:food:bread");
    expect(reason("pain", "en")).toBe("not-listed");
  });
});

describe("validateImageabilityData", () => {
  it('reports exactly the fixture\'s one deliberate gap (es "perro" has no query)', () => {
    expect(validateImageabilityData(FIXTURE)).toEqual([
      'es: imageable "perro" has no English query',
    ]);
  });

  it("reports every structural problem", () => {
    const bad: ImageabilityData = structuredClone(FIXTURE);
    bad.imageable.en.noun.push("apple", "The Car");
    bad.deny.en.push("doctor");
    bad.imageable.fr.food.push("fromage");
    bad.queries.es.chat = "cat";
    const problems = validateImageabilityData(bad);
    expect(problems).toContain('en: "apple" is in more than one category');
    expect(problems).toContain('en: "The Car" is not in lookup form ("car")');
    expect(problems).toContain('en: "doctor" is both denied and imageable');
    expect(problems).toContain('fr: imageable "fromage" has no English query');
    expect(problems).toContain('es: query for "chat" but the term is not imageable');
  });
});

describe("the real scripts/vocab-imageability.json", () => {
  it("is structurally valid", () => {
    const problems = validateImageabilityData(IMAGEABILITY_DATA);
    expect(problems, problems.join("\n")).toEqual([]);
  });

  it("makes no term flagged on 2026-10-07 imageable, in any course", () => {
    const leaks = FLAGGED_TERMS_2026_10_07.flatMap((term) =>
      IMAGE_LANGS.filter((lang) => classifyImageability(term, lang).imageable).map(
        (lang) => `${lang}:${term}`,
      ),
    );
    expect(leaks).toEqual([]);
  });

  it("keeps curriculum.ts's only imageKey ('doctor') imageable in English", () => {
    expect(classifyImageability("doctor", "en").imageable).toBe(true);
  });
});
