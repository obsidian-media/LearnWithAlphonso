import { describe, expect, it } from "vitest";
import type { Question } from "./curriculum";
import { BANK_ES } from "./lesson-bank-es";
import { BANK_FR } from "./lesson-bank-fr";
import { packQuestions, type Pack } from "./bank-engine";
import { ROMANCE_CLOZE } from "./romance-cloze-options";
import { isFormOf } from "./conjugation-form-check";
import { withReviewFix } from "./review-fixes";
import { CONJUGATION_DRILLS, bracketedVerb, paradigm } from "./romance-conjugation";

// What this guards (docs/distractor-policy.md, "French and Spanish", conjugation drills): a fill-in
// line that conjugates a bracketed verb ("Je ___ (parler) français.") offers only forms of THAT verb.
// Before this, the wrong options were the pack's other answers (other verbs), so the one option that
// looked like the bracketed verb was the answer.
//
// The check (conjugation-form-check.ts) does NOT use the engine's paradigms (romance-conjugation.ts):
// a wrong paradigm entry in the engine fails here instead of passing silently (backlog 0.0-av item 5).

const INFINITIVE = {
  fr: /^(se\s+|s')?[\p{L}]+(er|ir|re)$/u,
  es: /^[\p{L}]*(ar|er|ir|ír)(se)?$/u,
};
/** A pack is a drill when at least this many of its lines are; two "(quarter)" clues are not. */
const MIN_DRILL_LINES = 5;

type Drill = { pack: string; q: Question; verb: string; answer: string; wrong: string[] };

/** Every built question that conjugates a bracketed infinitive: the answer reads as a form of it. */
function drills(packs: Pack[]): Drill[] {
  const out: Drill[] = [];
  for (const p of packs) {
    if (p.kind !== "cloze" || /^(fr|es)g/.test(p.id)) continue;
    const inPack: Drill[] = [];
    const lang = p.id.startsWith("fr") ? "fr" : "es";
    // As learners get them: with the full content review's fixes applied (src/data/review-fixes.ts).
    for (const q of packQuestions(p).map((x) => withReviewFix(lang, x))) {
      if (q.type !== "mc" && q.type !== "fill") continue;
      const verb = bracketedVerb(q.prompt);
      if (!verb || !INFINITIVE[lang].test(verb)) continue;
      const answer = q.type === "mc" ? q.choices[q.answer]! : q.answer;
      if (!isFormOf(answer, verb)) continue;
      const options = q.type === "mc" ? q.choices : q.bank;
      inPack.push({ pack: p.id, q, verb, answer, wrong: options.filter((o) => o !== answer) });
    }
    if (inPack.length >= MIN_DRILL_LINES) out.push(...inPack);
  }
  return out;
}

const a1a2 = [BANK_FR, BANK_ES].flatMap((b) => [...b.A1, ...b.A2]);
const b1c1 = [BANK_FR, BANK_ES].flatMap((b) => [...b.B1, ...b.B2, ...b.C1]);
const nonForms = (d: Drill) => d.wrong.filter((w) => !isFormOf(w, d.verb));

describe("the gate's own form check", () => {
  it("accepts forms of the verb, irregular ones included", () => {
    expect(isFormOf("te lèves", "se lever")).toBe(true);
    expect(isFormOf("m'habitue", "s'habituer")).toBe(true);
    expect(isFormOf("duermo", "dormir")).toBe(true);
    expect(isFormOf("empecé", "empezar")).toBe(true);
    expect(isFormOf("elijo", "elegir")).toBe(true);
    expect(isFormOf("sigo", "seguir")).toBe(true);
    expect(isFormOf("conduzco", "conducir")).toBe(true);
    expect(isFormOf("sommes", "être")).toBe(true);
    expect(isFormOf("fueron", "ir")).toBe(true);
  });
  it("rejects other verbs (the defect this gate exists for)", () => {
    // The real options fra2p6 and esa1p5 shipped with.
    expect(isFormOf("me douche", "se réveiller")).toBe(false);
    expect(isFormOf("m'habitue", "se réveiller")).toBe(false);
    expect(isFormOf("como", "hablar")).toBe(false);
    expect(isFormOf("tengo", "hablar")).toBe(false);
    expect(isFormOf("mange", "parler")).toBe(false);
    expect(isFormOf("fais", "dormir")).toBe(false);
    // Stems that start with the same consonants: the vowels tell the verbs apart.
    expect(isFormOf("pudo", "pedir")).toBe(false);
    expect(isFormOf("pidió", "pedir")).toBe(true);
    expect(isFormOf("parlons", "prendre")).toBe(false);
    expect(isFormOf("porte", "parler")).toBe(false);
    expect(isFormOf("estoy", "ser")).toBe(false);
  });
});

describe("French and Spanish A1/A2 conjugation drills", () => {
  const found = drills(a1a2);

  it("finds the drills (the detector has not gone blind)", () => {
    // fra2p1, fra2p6, fra2p7, esa1p5, esa1p22, esa2p2, esa2p6, esa2p16, esa2p18, esa2p26
    expect(found.length).toBeGreaterThanOrEqual(217);
    for (const id of Object.keys(CONJUGATION_DRILLS))
      expect(
        found.some((d) => d.pack === id),
        id,
      ).toBe(true);
  });

  it("every wrong option is a form of the bracketed verb", () => {
    const bad = found
      .filter((d) => nonForms(d).length > 0)
      .map((d) => `${d.q.id} ${d.q.prompt} => ${d.answer} | ${nonForms(d).join(" / ")}`);
    expect(bad).toEqual([]);
  });

  it("three distinct wrong options, none equal to the answer", () => {
    for (const d of found) {
      expect(d.wrong.length, d.q.id).toBe(3);
      const keys = new Set([d.answer, ...d.wrong].map((o) => o.toLowerCase()));
      expect(keys.size, d.q.id).toBe(4);
    }
  });

  it("every drill line names its subject, so the other persons are clearly wrong", () => {
    const SUBJECT =
      /(^|[\s¿])(je|j'|tu|il|elle|on|nous|vous|ils|elles|yo|tú|él|ella|usted|nosotros|nosotras|ellos|ellas|ustedes)(?=[\s,_])|^j'/iu;
    for (const d of found) expect(SUBJECT.test(d.q.prompt), `${d.q.id} ${d.q.prompt}`).toBe(true);
  });

  it("the engine's paradigms contain each drill line's own answer", () => {
    const all = [BANK_FR, BANK_ES].flatMap((b) => [...b.A1, ...b.A2]);
    for (const [id, drill] of Object.entries(CONJUGATION_DRILLS)) {
      const pack = all.find((p) => p.id === id)!;
      expect(ROMANCE_CLOZE[id], `${id} must not also have written options`).toBeUndefined();
      for (const line of pack.data.split("\n").filter((l) => l.trim())) {
        const [left, answer] = line.split("|").map((s) => s.trim());
        const verb = bracketedVerb(left!)!;
        const forms = paradigm(drill.lang, drill.tense, verb);
        expect(forms, `${id} ${verb}`).not.toBeNull();
        expect(
          forms!.map((f) => f.toLowerCase()),
          `${id} ${left}`,
        ).toContain(answer!.toLowerCase());
      }
    }
  });

  it("a French je form is elided before a vowel (J'ai, not Je ai)", () => {
    for (const d of found.filter((x) => x.pack.startsWith("fr")))
      expect(/^Je ___ \S+\)?/.test(d.q.prompt) && /^[aeiouéèêh]/i.test(d.answer), d.q.id).toBe(
        false,
      );
  });
});

describe("B1 to C1 conjugation drills (not fixed yet: the count may only go down)", () => {
  it("drills offering a wrong option that is not a form of the bracketed verb", () => {
    const found = drills(b1c1);
    const bad = found.filter((d) => nonForms(d).length > 0).length;
    // 2026-11-06: 490 of the 507 drill questions this detector finds (477 before the form check
    // compared vowels: it had read "estoy" as a form of ser). Lower this number when you fix some;
    // never raise it. 2026-11-06 content review: French 143 -> 3, so 490 -> 350 (Spanish lowers it
    // again in its own PR; if both merge, keep the lower measured number).
    expect(bad).toBeLessThanOrEqual(350);
  });
});

describe("phrases ending in please or thanks (A1/A2 vocabulary questions)", () => {
  const TAG = /,\s*(s'il vous plaît|s'il te plaît|merci|por favor|gracias)\s*[?.!]*$/i;
  const tag = (s: string) => s.replace(/[’]/g, "'").match(TAG)?.[1]?.toLowerCase() ?? null;
  it("the answer is never the only option with its ending (the English gloss would give it away)", () => {
    const bad: string[] = [];
    for (const p of a1a2.filter((x) => x.kind === "pair")) {
      for (const q of packQuestions(p)) {
        if (q.type !== "mc" && q.type !== "fill") continue;
        const answer = q.type === "mc" ? q.choices[q.answer]! : q.answer;
        const t = tag(answer);
        if (!t) continue;
        const options = q.type === "mc" ? q.choices : q.bank;
        if (!options.some((o) => o !== answer && tag(o) === t))
          bad.push(`${q.id} ${answer} | ${options.join(" / ")}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("possessive drills", () => {
  const POSSESSIVE = {
    fr: /^(mon|ma|mes|ton|ta|tes|son|sa|ses|notre|nos|votre|vos|leur|leurs)$/i,
    es: /^(mi|mis|tu|tus|su|sus|nuestro|nuestra|nuestros|nuestras)$/i,
  };
  it("a possessive blank says whose it is: 'Nous aimons ___ ville' fits notre and leur alike", () => {
    const bad: string[] = [];
    for (const p of a1a2.filter((x) => x.kind === "cloze" && !/^(fr|es)g/.test(x.id))) {
      for (const q of packQuestions(p)) {
        if (q.type !== "mc" && q.type !== "fill") continue;
        const answer = q.type === "mc" ? q.choices[q.answer]! : q.answer;
        if (
          POSSESSIVE[p.id.startsWith("fr") ? "fr" : "es"].test(answer) &&
          !/\([^)]+\)/.test(q.prompt)
        )
          bad.push(`${q.id} ${q.prompt}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
