import { describe, expect, it } from "vitest";
import { BANK_ES } from "./lesson-bank-es";
import { packQuestions } from "./bank-engine";
import { MINIMAL_PAIR_ROWS } from "./es-minimal-pairs";
import { curriculumEs } from "./curriculum-es";

// Owner decision 2026-11-16: the Spanish "Minimal Pairs" lessons are spelling-choice questions, not plain
// listening (under seseo, yeísmo and b/v the two words of a pair sound the same, so there is nothing to
// hear). This holds that, and that every item still has one answer the clue decides.

const IDS = ["esa1p28", "esa2p28", "esb1p28", "esb2p28", "esc1p28"];
const packs = Object.values(BANK_ES)
  .flat()
  .filter((p) => p.title === "Minimal Pairs");

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i]![j] = Math.min(
        d[i - 1]![j]! + 1,
        d[i]![j - 1]! + 1,
        d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return d[a.length]![b.length]!;
}

describe("Spanish minimal pairs are spelling-choice questions", () => {
  it("the five lessons exist, in order, and none is a listening pack", () => {
    expect(packs.map((p) => p.id)).toEqual(IDS);
    for (const p of packs) expect(p.kind, p.id).toBe("cloze");
  });

  it("no question of those lessons is plain listening, and none carries audio", () => {
    let n = 0;
    for (const p of packs)
      for (const q of packQuestions(p)) {
        n++;
        expect(["mc", "fill"], q.id).toContain(q.type);
        expect(q, q.id).not.toHaveProperty("audioText");
      }
    expect(n).toBe(125);
  });

  it("the built course agrees: those lesson ids hold no listening question", () => {
    const lessonIds = new Set(IDS.flatMap((id) => [1, 2, 3, 4, 5].map((k) => `${id}l${k}`)));
    let n = 0;
    for (const u of curriculumEs)
      for (const l of u.lessons)
        if (lessonIds.has(l.id))
          for (const q of l.questions) {
            n++;
            expect(q.type, q.id).not.toBe("listening");
          }
    expect(n).toBe(125);
  });

  it("every line is a blank, a clue and the sound-alike twin among the options", () => {
    for (const p of packs) {
      const rows = MINIMAL_PAIR_ROWS[p.id]!;
      const qs = packQuestions(p);
      expect(qs.length, p.id).toBe(25);
      qs.forEach((q, i) => {
        const r = rows[i]!;
        const where = `${q.id} ${r.sentence}`;
        if (q.type !== "mc" && q.type !== "fill") throw new Error(where);
        expect(r.sentence.split("___").length - 1, where).toBe(1);
        expect(q.prompt, where).toContain(`(${r.clue})`);
        expect(r.clue.toLowerCase(), where).not.toContain(r.answer.toLowerCase());
        const options = q.type === "mc" ? q.choices : q.bank;
        const answer = q.type === "mc" ? q.choices[q.answer] : q.answer;
        expect(answer, where).toBe(r.answer);
        expect(new Set(options).size, where).toBe(4);
        // The twin is the minimal pair: one or two letters away from the answer.
        expect(options, where).toContain(r.wrong[0]);
        expect(distance(r.answer, r.wrong[0]!), where).toBeLessThanOrEqual(2);
        expect(q.explanation, where).toContain(`"${r.answer}"`);
        expect(q.explanation, where).not.toMatch(/is correct here/);
      });
    }
  });

  it("each pair is taught from both sides in its lesson", () => {
    // A learner who sees only "casa" never learns that "caza" is the other word.
    for (const p of packs) {
      const rows = MINIMAL_PAIR_ROWS[p.id]!;
      const answers = new Set(rows.map((r) => r.answer));
      const twinsAsAnswers = rows.filter((r) => answers.has(r.wrong[0]!)).length;
      expect(twinsAsAnswers, p.id).toBeGreaterThanOrEqual(20);
    }
  });
  it("a masculine adjective answer (basto, vasto) never sits in a feminine sentence", () => {
    // "La tela ... es muy basto y áspera" expected a masculine word after a feminine noun.
    const rows = Object.values(MINIMAL_PAIR_ROWS)
      .flat()
      .filter((r) => r.answer === "basto" || r.answer === "vasto");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.sentence, r.sentence).not.toMatch(/^(La|Una|Esta|Esa|Las|Unas) /);
      expect(r.sentence, r.sentence).not.toMatch(/ y \p{L}+as?\.$/u);
    }
  });
});
