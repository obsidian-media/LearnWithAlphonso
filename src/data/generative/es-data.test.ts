import { describe, expect, it } from "vitest";
import { ES_NOUNS, ES_VERBS } from "./es-data";
import { bankLines, readWiktionarySummary } from "./romance-bank.testutil";
import { esLibPresent, esLibPreterite } from "./romance-libs.testutil";
import { needsElisionFlag, type Person } from "./romance";

const PERSONS: Person[] = [0, 1, 2, 3, 4, 5];

describe("gate 1 (es): the committed table and the library agree (the library is a tripwire only)", () => {
  it("every present form equals the library form", () => {
    for (const v of ES_VERBS)
      for (const p of PERSONS)
        expect(esLibPresent(v.inf, p), `${v.inf} person ${p}`).toBe(v.present[p]);
  });

  it("every preterite form equals the library form, for verbs that have a preterite table", () => {
    for (const v of ES_VERBS.filter((x) => x.preterite))
      for (const p of PERSONS)
        expect(esLibPreterite(v.inf, p), `${v.inf} person ${p}`).toBe(v.preterite![p]);
  });

  it("a verb without a preterite table is one the library genuinely gets wrong", () => {
    // leer: the library drops the accents and the y (leyó, leyeron). If it is
    // ever fixed, this fails and the verb can be given a table.
    const leer = ES_VERBS.find((v) => v.inf === "leer")!;
    expect(leer.preterite).toBeUndefined();
    expect(PERSONS.map((p) => esLibPreterite("leer", p))).not.toEqual([
      "leí",
      "leíste",
      "leyó",
      "leímos",
      "leísteis",
      "leyeron",
    ]);
  });
});

const HINT = /^(?:Ayer,? )?(yo|tú|él|ella|nosotros|ellos|ellas|ustedes) ___ \(([^)]+)\)/i;
const PERSON_OF: Record<string, Person> = {
  yo: 0,
  tú: 1,
  él: 2,
  ella: 2,
  nosotros: 3,
  ellos: 5,
  ellas: 5,
  ustedes: 5,
};

describe("in-repo cross-check (es): existing hand-authored lines against our tables", () => {
  const lines = bankLines("es").filter((l) => l.pack.kind === "cloze");
  const PRESENT_PACKS = ["esa1p5", "esa1p22", "esa2p6", "esa2p18", "esa2p26"];

  it("present: every line of the present-tense verb packs agrees with the table", () => {
    let covered = 0;
    for (const { pack, left, right } of lines) {
      if (!PRESENT_PACKS.includes(pack.id)) continue;
      const m = HINT.exec(left);
      if (!m) continue;
      const verb = ES_VERBS.find((v) => v.inf === m[2]!.toLowerCase());
      if (!verb) continue;
      expect(right, left).toBe(verb.present[PERSON_OF[m[1]!.toLowerCase()]!]);
      covered++;
    }
    expect(covered).toBeGreaterThanOrEqual(10);
  });

  it("preterite: the yo-form past-tense pack agrees with the table", () => {
    let covered = 0;
    for (const { pack, left, right } of lines) {
      if (pack.id !== "esa2p2") continue;
      const m = HINT.exec(left);
      if (!m) continue;
      const verb = ES_VERBS.find((v) => v.inf === m[2]!.toLowerCase());
      if (!verb?.preterite) continue;
      expect(right, left).toBe(verb.preterite[PERSON_OF[m[1]!.toLowerCase()]!]);
      covered++;
    }
    expect(covered).toBeGreaterThanOrEqual(5);
  });
});

describe("nouns (es): shipped, with positive gender evidence, never inferred from the ending", () => {
  const all = bankLines("es");
  const wikt = readWiktionarySummary();
  const text = all.map((l) => `${l.left} ${l.right}`).join("\n");

  it("each noun appears in its recorded source pack", () => {
    for (const n of ES_NOUNS) {
      const inPack = all.some(
        (l) =>
          l.pack.id === n.src &&
          (l.right.toLowerCase() === n.key ||
            new RegExp(`(^|[^\\p{L}])${n.key}(?![\\p{L}])`, "iu").test(`${l.left} ${l.right}`)),
      );
      expect(inPack, `${n.key} in ${n.src}`).toBe(true);
    }
  });

  it("corpus evidence is real: an article or demonstrative next to the noun, never contradicting the table", () => {
    const MASC = ["el", "un", "los", "unos", "este", "ese", "estos", "esos"];
    const FEM = ["la", "una", "las", "unas", "esta", "esa", "estas", "esas"];
    for (const n of ES_NOUNS) {
      const re = new RegExp(
        `(?:^|[^\\p{L}])(el|la|los|las|un|una|unos|unas|este|esta|ese|esa|estos|estas|esos|esas)\\s+${n.key}(?![\\p{L}])`,
        "giu",
      );
      const hits = [...text.matchAll(re)].map((m) => m[1]!.toLowerCase());
      for (const h of hits)
        expect(n.gender === "m" ? MASC : FEM, `${n.key}: "${h} ${n.key}"`).toContain(h);
      if (n.genderEvidence === "corpus")
        expect(hits.length, `${n.key} has no corpus hit`).toBeGreaterThan(0);
    }
  });

  it("every noun without corpus evidence is confirmed by the third source", () => {
    for (const n of ES_NOUNS) {
      expect(["corpus", "wiktionary"]).toContain(n.genderEvidence);
      if (n.genderEvidence !== "wiktionary") continue;
      const entry = wikt.es.nouns[n.key];
      expect(entry?.status, `${n.key} needs the third source`).toBe("agree");
      expect(entry!.gender).toBe(n.gender);
    }
  });

  it("the ending rule is a tripwire: a -o/-a noun against its ending needs an explicit review entry", () => {
    const REVIEWED_AGAINST_ENDING = new Set<string>([]); // none today (mano, día, mapa... are not used)
    for (const n of ES_NOUNS) {
      const against =
        (n.key.endsWith("o") && n.gender === "f") || (n.key.endsWith("a") && n.gender === "m");
      if (against) expect(REVIEWED_AGAINST_ENDING.has(n.key), n.key).toBe(true);
    }
  });

  it("every noun starting with a, á, ha or há has an explicit stressedA flag, and none is true", () => {
    for (const n of ES_NOUNS) {
      if (/^(a|á|ha|há)/i.test(n.key)) {
        expect(n.stressedA, `${n.key} needs stressedA`).toBeTypeOf("boolean");
        expect(n.stressedA, `${n.key} would take el/un`).toBe(false);
      }
    }
  });

  it("no Spanish noun needs elision flags (that is French only)", () => {
    for (const n of ES_NOUNS) expect(n.elides).toBeUndefined();
    expect(needsElisionFlag("hola")).toBe(true);
  });

  it("plural nouns are count nouns", () => {
    for (const n of ES_NOUNS) if (n.number === "p") expect(n.count, n.key).toBe(true);
  });
});

describe("third source (es): the committed Wiktionary summary covers the current tables", () => {
  const wikt = readWiktionarySummary();

  it("has no disagreement and a verified entry for every verb, with the values that were checked", () => {
    expect(wikt.disagreements).toEqual([]);
    for (const v of ES_VERBS) {
      const entry = wikt.es.verbs[v.inf];
      expect(entry?.status, `${v.inf} not verified`).toBe("agree");
      expect(entry!.present, `${v.inf} changed since checked`).toEqual([...v.present]);
      expect(entry!.preterite, `${v.inf} changed since checked`).toEqual([...(v.preterite ?? [])]);
    }
  });

  it("has a verified entry for every noun, with the gender that was checked", () => {
    for (const n of ES_NOUNS) {
      const entry = wikt.es.nouns[n.key];
      expect(entry?.status, `${n.key} not verified`).toBe("agree");
      expect(entry!.gender, `${n.key} changed since checked`).toBe(n.gender);
    }
  });
});
