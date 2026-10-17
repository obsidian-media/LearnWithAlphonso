import { describe, expect, it } from "vitest";
import {
  FR_AVOIR_PRESENT,
  FR_ETRE_PRESENT,
  FR_NOUNS,
  FR_PLACES,
  FR_VERBS,
  type FrVerb,
} from "./fr-data";
import { frCandidates } from "./fr-compile";
import { bankLines, readWiktionarySummary } from "./romance-bank.testutil";
import {
  frLibAlwaysEtre,
  frLibGetAux,
  frLibPasseCompose,
  frLibPresent,
} from "./romance-libs.testutil";
import { needsElisionFlag, type Person } from "./romance";

const PERSONS: Person[] = [0, 1, 2, 3, 4, 5];

describe("gate 1 (fr): the committed table, the library and the shipped course agree", () => {
  it("every present form equals the library form", () => {
    for (const v of FR_VERBS)
      for (const p of PERSONS)
        expect(frLibPresent(v.inf, p), `${v.inf} person ${p}`).toBe(v.present[p]);
  });

  it("the auxiliary present forms equal the library's", () => {
    for (const p of PERSONS) {
      expect(frLibPresent("avoir", p)).toBe(FR_AVOIR_PRESENT[p]);
      expect(frLibPresent("être", p)).toBe(FR_ETRE_PRESENT[p]);
    }
  });

  it("every avoir passé composé equals the library's", () => {
    for (const v of FR_VERBS.filter((x) => x.aux === "avoir"))
      for (const p of PERSONS)
        expect(frLibPasseCompose(v.inf, p, { aux: "AVOIR" }), `${v.inf} person ${p}`).toBe(
          `${FR_AVOIR_PRESENT[p]} ${v.participle}`,
        );
  });

  it("every être participle agrees with the library when BOTH gender and number are passed", () => {
    const cases = [
      ["ms", 2, "M", "S"],
      ["fs", 2, "F", "S"],
      ["mp", 5, "M", "P"],
      ["fp", 5, "F", "P"],
    ] as const;
    for (const v of FR_VERBS.filter((x) => x.aux === "etre"))
      for (const [key, person, gender, number] of cases)
        expect(
          frLibPasseCompose(v.inf, person, {
            aux: "ETRE",
            agreeGender: gender,
            agreeNumber: number,
          }),
          `${v.inf} ${key}`,
        ).toBe(v.pcEtre![key]);
  });

  it("documents the trap: the library silently returns a singular participle without agreeNumber", () => {
    // Our compiler never calls the library (the table's pcEtre is the source),
    // but the table's plural forms must be the ones the library only produces
    // when agreeNumber is passed. If the library ever changes, this flags it.
    expect(frLibPasseCompose("aller", 3, { aux: "ETRE", agreeGender: "M" })).toBe("sommes allé");
    expect(frLibPasseCompose("aller", 3, { aux: "ETRE", agreeGender: "M", agreeNumber: "P" })).toBe(
      "sommes allés",
    );
  });

  it("auxiliary: always-être verbs are checked against alwaysAuxEtre, and only those", () => {
    for (const v of FR_VERBS) {
      if (v.alwaysEtre) {
        expect(v.aux).toBe("etre");
        expect(frLibAlwaysEtre(v.inf), v.inf).toBe(true);
      } else if (v.aux === "avoir") {
        expect(frLibAlwaysEtre(v.inf), v.inf).toBe(false);
      }
    }
  });

  it("dual-auxiliary verbs are flagged intransitive-only and are never given an object", () => {
    const dual = FR_VERBS.filter((v) => v.intransitiveOnly);
    expect(dual.map((v) => v.inf)).toContain("rentrer");
    for (const v of dual) {
      expect(v.aux).toBe("etre");
      // The library's own default for these is AVOIR, which is exactly why
      // the table must say être and the template must forbid an object.
      expect(frLibGetAux(v.inf), v.inf).toBe("AVOIR");
      expect(v.uses ?? []).toEqual([]);
      for (const template of ["fr-svo-present", "fr-svo-pc"] as const)
        expect(frCandidates(template, v.inf), `${v.inf} in ${template}`).toEqual([]);
      for (const item of frCandidates("fr-etre-pc", v.inf)) expect(item.articleKind).toBe("place");
    }
  });

  it("every être verb carries four agreeing participles and a place allowlist", () => {
    for (const v of FR_VERBS.filter((x) => x.aux === "etre")) {
      expect(v.pcEtre, v.inf).toBeDefined();
      expect(v.places?.keys.length, v.inf).toBeGreaterThan(0);
      for (const key of v.places!.keys) {
        const place = FR_PLACES.find((p) => p.key === key);
        expect(place, `${v.inf} -> ${key}`).toBeDefined();
        expect(place!.forms[v.places!.rel], `${v.inf} -> ${key}`).toBeTruthy();
      }
    }
  });

  it("every vowel, h, y or w initial verb carries an explicit elides flag", () => {
    for (const v of FR_VERBS)
      if (needsElisionFlag(v.inf)) expect(v.elides, v.inf).toBeTypeOf("boolean");
  });
});

/** Subject word -> person, for reading existing cloze lines. */
const SUBJECT_PERSON: Record<string, Person> = {
  je: 0,
  "j'": 0,
  tu: 1,
  il: 2,
  elle: 2,
  nous: 3,
  vous: 4,
  ils: 5,
  elles: 5,
};

const HINT = /^(?:Hier, )?(je|j'|tu|il|elle|nous|vous|ils|elles) ?___ \(([^)]+)\)/i;

function verbByInf(inf: string): FrVerb | undefined {
  return FR_VERBS.find((v) => v.inf === inf);
}

describe("in-repo cross-check (fr): existing hand-authored lines against our tables", () => {
  const lines = bankLines("fr").filter((l) => l.pack.kind === "cloze");

  it("present: fra2p1's 'je' lines agree with the table for every verb we use", () => {
    let covered = 0;
    for (const { pack, left, right } of lines) {
      if (pack.id !== "fra2p1") continue;
      const m = HINT.exec(left);
      if (!m) continue;
      const verb = verbByInf(m[2]!.toLowerCase());
      if (!verb || verb.aux === "etre") continue;
      expect(right, `${left}`).toBe(verb.present[SUBJECT_PERSON[m[1]!.toLowerCase()]!]);
      covered++;
    }
    expect(covered).toBeGreaterThanOrEqual(8);
  });

  it("passé composé: frb1p1's lines agree with the table for every verb we use", () => {
    let covered = 0;
    for (const { pack, left, right } of lines) {
      if (pack.id !== "frb1p1") continue;
      const m = HINT.exec(left);
      if (!m) continue;
      const verb = verbByInf(m[2]!.toLowerCase());
      if (!verb) continue;
      const p = SUBJECT_PERSON[m[1]!.toLowerCase()]!;
      if (verb.aux === "avoir") {
        expect(right, left).toBe(`${FR_AVOIR_PRESENT[p]} ${verb.participle}`);
      } else {
        // Gender is not known from je/tu/nous/vous: accept any agreeing participle.
        const participles = Object.values(verb.pcEtre!).map((f) => f.split(" ")[1]!);
        expect(
          participles.map((part) => `${FR_ETRE_PRESENT[p]} ${part}`),
          left,
        ).toContain(right);
      }
      covered++;
    }
    expect(covered).toBeGreaterThanOrEqual(8);
  });
});

describe("nouns (fr): every entry is shipped, and gender is shown by the course or the third source", () => {
  const pairs = bankLines("fr").filter((l) => l.pack.kind === "pair");
  const wikt = readWiktionarySummary();

  function articlesFor(key: string): string[] {
    const out: string[] = [];
    for (const { right } of pairs) {
      const m = new RegExp(`^(le|la|l'|les|un|une) ?${key}$`, "i").exec(right);
      if (m) out.push(m[1]!.toLowerCase());
    }
    return out;
  }

  it("each noun is a shipped pair line in its recorded source pack", () => {
    for (const n of FR_NOUNS) {
      const hit = pairs.find(
        (l) =>
          l.pack.id === n.src && new RegExp(`^(le|la|l'|les|un|une) ?${n.key}$`, "i").test(l.right),
      );
      expect(hit, `${n.key} in ${n.src}`).toBeDefined();
    }
  });

  it("the article in the shipped data agrees with the table gender and number", () => {
    for (const n of FR_NOUNS) {
      const arts = articlesFor(n.key);
      expect(arts.length, n.key).toBeGreaterThan(0);
      for (const a of arts) {
        if (a === "le" || a === "un") expect(n.gender, `${n.key}: ${a}`).toBe("m");
        if (a === "la" || a === "une") expect(n.gender, `${n.key}: ${a}`).toBe("f");
        if (a === "les") expect(n.number, `${n.key}: ${a}`).toBe("p");
      }
      if (n.number === "p") expect(arts, n.key).toContain("les");
    }
  });

  it("an l' noun, whose article hides the gender, is confirmed by the third source", () => {
    for (const n of FR_NOUNS) {
      const arts = articlesFor(n.key);
      const showsGender = arts.some((a) => ["le", "la", "un", "une", "les"].includes(a));
      if (showsGender) continue;
      const entry = wikt.fr.nouns[n.key];
      expect(entry?.status, `${n.key} needs the third source`).toBe("agree");
      expect(entry?.gender).toBe(n.gender);
    }
  });

  it("every vowel, h, y or w initial noun carries an explicit elides flag", () => {
    for (const n of FR_NOUNS)
      if (needsElisionFlag(n.key.split(" ")[0]!)) expect(n.elides, n.key).toBeTypeOf("boolean");
    for (const p of FR_PLACES)
      if (needsElisionFlag(p.key)) expect(p.elides, p.key).toBeTypeOf("boolean");
  });

  it("a mass noun is never plural-only, and plural nouns are count nouns", () => {
    for (const n of FR_NOUNS) if (n.number === "p") expect(n.count, n.key).toBe(true);
  });

  it("place phrases are exactly what the shipped article implies", () => {
    for (const place of FR_PLACES) {
      const arts = articlesFor(place.key);
      expect(arts.length, place.key).toBeGreaterThan(0);
      const a = arts[0]!;
      const expected = (prep: "à" | "de") =>
        a === "le"
          ? prep === "à"
            ? `au ${place.key}`
            : `du ${place.key}`
          : a === "la"
            ? `${prep} la ${place.key}`
            : `${prep} l'${place.key}`;
      for (const [rel, phrase] of Object.entries(place.forms))
        expect(phrase, `${place.key} ${rel}`).toBe(expected(rel === "from" ? "de" : "à"));
    }
  });
});

describe("third source (fr): the committed Wiktionary summary covers the current tables", () => {
  const wikt = readWiktionarySummary();

  it("has no disagreement and a verified entry for every verb, with the values that were checked", () => {
    expect(wikt.disagreements).toEqual([]);
    for (const v of FR_VERBS) {
      const entry = wikt.fr.verbs[v.inf];
      expect(entry?.status, `${v.inf} not verified`).toBe("agree");
      expect(entry!.present, `${v.inf} changed since it was checked`).toEqual([...v.present]);
      const participles = v.pcEtre
        ? Object.values(v.pcEtre).map((f) => f.split(" ")[1]!)
        : [v.participle];
      expect(entry!.participles, `${v.inf} participles changed since checked`).toEqual(participles);
    }
  });

  it("has a verified entry for every noun, with the gender that was checked", () => {
    for (const n of FR_NOUNS) {
      const entry = wikt.fr.nouns[n.key];
      expect(entry?.status, `${n.key} not verified`).toBe("agree");
      expect(entry!.gender, `${n.key} changed since checked`).toBe(n.gender);
    }
  });
});
