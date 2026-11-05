import { describe, expect, it } from "vitest";
import { BANK_ES } from "./lesson-bank-es";
import { BANK_FR } from "./lesson-bank-fr";
import { packQuestions, type Pack } from "./bank-engine";
import { ROMANCE_CLOZE } from "./romance-cloze-options";
import { PLACEMENT_QUESTIONS_ES } from "./placement-es";
import { PLACEMENT_QUESTIONS_FR } from "./placement-fr";
import type { PlacementQuestion } from "./placement";
import {
  EXTRA_DECOYS,
  PACK_CLASS_LABELS,
  ROMANCE_A1A2,
  bannedBecause,
  homophoneOnly,
  optionClass,
  optionsOverlap,
  sameMeaning,
} from "./romance-options";

// What this guards (docs/distractor-policy.md, "French and Spanish"): the hand-authored A1/A2 packs of
// the French and Spanish courses. A wrong option is the same kind of word as the answer, is not a
// second right answer, and a fill-in sentence takes its wrong options from a list written for it.

const packs: Pack[] = [BANK_FR, BANK_ES]
  .flatMap((b) => [...b.A1, ...b.A2])
  .filter((p) => ROMANCE_A1A2.test(p.id));
const lines = (p: Pack) =>
  p.data
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split("|").map((x) => x.trim()));
const generated = (p: Pack) => /^(fr|es)g/.test(p.id);

describe("the tables are aligned with the packs", () => {
  it("every class label string has one letter per line of its pack", () => {
    for (const [id, labels] of Object.entries(PACK_CLASS_LABELS)) {
      const pack = packs.find((p) => p.id === id);
      expect(pack, id).toBeDefined();
      expect(labels.length, id).toBe(lines(pack!).length);
    }
  });
  it("every extra-decoy pack exists and no decoy is already an answer of that pack", () => {
    for (const [id, groups] of Object.entries(EXTRA_DECOYS)) {
      const pack = packs.find((p) => p.id === id);
      expect(pack, id).toBeDefined();
      const answers = new Set(lines(pack!).map((l) => l[1]!.toLowerCase()));
      for (const g of groups)
        for (const w of g.words) expect(answers.has(w), `${id} ${w}`).toBe(false);
    }
  });
  it("authored cloze options: three distinct wrong options per line, none equal to the answer, no clue that gives it away", () => {
    for (const [id, rows] of Object.entries(ROMANCE_CLOZE)) {
      const pack = packs.find((p) => p.id === id);
      expect(pack, id).toBeDefined();
      const data = lines(pack!);
      for (const [i, row] of Object.entries(rows)) {
        const [left, answer] = data[Number(i)]!;
        const where = `${id}#${i} ${left}`;
        expect(new Set(row.wrong.map((w) => w.toLowerCase())).size, where).toBe(3);
        expect(
          row.wrong.map((w) => w.toLowerCase()),
          where,
        ).not.toContain(answer!.toLowerCase());
        if (row.hint) expect(row.hint.toLowerCase(), where).not.toBe(answer!.toLowerCase());
      }
      expect(Math.max(...Object.keys(rows).map(Number)), id).toBeLessThan(data.length);
    }
  });
});

describe("pair packs: the wrong options of a vocabulary question", () => {
  it("the old failures are caught by the detectors", () => {
    // A colour offered as the word for "jacket"; a verb among nouns.
    expect(optionClass("fra1p4", 16, "jacket", "la veste")).not.toBe(
      optionClass("fra1p4", 0, "red", "marron"),
    );
    expect(optionClass("fra1p18", 3, "to sing", "chanter")).toBe("verb");
    expect(optionClass("fra1p18", 20, "hiking", "la randonnée")).toBe("noun");
    // Two options that both translate the English.
    expect(sameMeaning("parfois", "de temps à autre")).toBe(true);
    expect(sameMeaning("quoi", "quel")).toBe(true);
    expect(sameMeaning("quoi", "où")).toBe(false);
    // An option that contains the answer.
    expect(optionsOverlap("où", "où est")).toBe(true);
    expect(optionsOverlap("cajero", "cajero automático")).toBe(true);
    expect(optionsOverlap("la veste", "le chapeau")).toBe(false);
    expect(bannedBecause("neuf", "vieux")).toBeNull();
    expect(bannedBecause("usé", "vieux")).not.toBeNull();
  });

  it("no wrong option contains the answer, sits inside it, or means the same", () => {
    const bad: string[] = [];
    for (const lang of [BANK_FR, BANK_ES])
      for (const pack of [...lang.A1, ...lang.A2]) {
        if (pack.kind !== "pair" || !ROMANCE_A1A2.test(pack.id)) continue;
        for (const q of packQuestions(pack)) {
          if (q.type !== "mc" && q.type !== "fill") continue;
          const answer = q.type === "mc" ? q.choices[q.answer]! : q.answer;
          const options = q.type === "mc" ? q.choices : q.bank;
          for (const o of options) {
            const why = o === answer ? null : bannedBecause(answer, o);
            if (why) bad.push(`${q.id}: "${o}" for "${answer}" ${why}`);
          }
        }
      }
    expect(bad).toEqual([]);
  });

  it("every wrong option is the answer's kind of word whenever the pack has enough of that kind", () => {
    const bad: string[] = [];
    let questions = 0;
    for (const pack of packs) {
      if (pack.kind !== "pair") continue;
      const data = lines(pack);
      const entries = data.map(([g, t], i) => ({ text: t!, cls: optionClass(pack.id, i, g!, t!) }));
      const extra = (EXTRA_DECOYS[pack.id] ?? []).flatMap((g) =>
        g.words.map((text) => ({ text, cls: g.cls })),
      );
      const classOf = new Map<string, Set<string>>();
      for (const e of [...entries, ...extra]) {
        const k = e.text.toLowerCase();
        classOf.set(k, (classOf.get(k) ?? new Set()).add(e.cls));
      }
      const qs = packQuestions(pack);
      qs.forEach((q, i) => {
        if (q.type !== "mc" && q.type !== "fill") return;
        questions++;
        const me = entries[i]!;
        const answer = q.type === "mc" ? q.choices[q.answer]! : q.answer;
        const options = (q.type === "mc" ? q.choices : q.bank).filter((o) => o !== answer);
        const available = new Set(
          [...entries.filter((_, j) => j !== i), ...extra]
            .filter((e) => e.cls === me.cls && !bannedBecause(me.text, e.text))
            .map((e) => e.text.toLowerCase()),
        ).size;
        const same = options.filter((o) => classOf.get(o.toLowerCase())?.has(me.cls)).length;
        if (same < Math.min(3, available))
          bad.push(`${q.id} "${answer}" [${me.cls}]: ${options.join(" / ")}`);
      });
    }
    expect(questions).toBeGreaterThan(1000);
    expect(bad).toEqual([]);
  });

  it("every question of a hand-authored pair pack has three wrong options, except where the pack is too small", () => {
    const few: string[] = [];
    for (const pack of packs) {
      if (pack.kind !== "pair") continue;
      for (const q of packQuestions(pack)) {
        const n = q.type === "mc" ? q.choices.length : q.type === "fill" ? q.bank.length : 4;
        if (n < 4) few.push(`${q.id} (${n} options)`);
      }
    }
    expect(few).toEqual([]);
  });
});

describe("fill-in packs: a sentence has wrong options written for it", () => {
  // A line with no bracketed verb or word to build on, in a pack that was written by hand. Its wrong
  // options may not be borrowed from other sentences of the pack.
  const UNAUTHORED_OK = new Set([
    "fra2p14", // possessive drills: the bracket names the owner and the pool is the possessives
  ]);
  it("every hand-authored cloze line without a bracketed hint has authored options", () => {
    const missing: string[] = [];
    for (const pack of packs) {
      if (pack.kind !== "cloze" || generated(pack) || UNAUTHORED_OK.has(pack.id)) continue;
      lines(pack).forEach(([left], i) => {
        if (/\([^)]+\)/.test(left!)) return;
        if (!ROMANCE_CLOZE[pack.id]?.[i]) missing.push(`${pack.id}#${i} ${left}`);
      });
    }
    expect(missing).toEqual([]);
  });

  it("a pack that has options written for some lines has them for every line", () => {
    // A line left out falls back to the other answers of its pack. That suits a pack that conjugates
    // one verb, but not a pack whose answers mix kinds of word: "Es ___ (midnight)" offered "es", and
    // "Está ___ (raining)" offered "Hay". The bracket exemption above does not catch these lines.
    const partial: string[] = [];
    for (const [id, rows] of Object.entries(ROMANCE_CLOZE)) {
      lines(packs.find((p) => p.id === id)!).forEach(([left], i) => {
        if (!rows[i]) partial.push(`${id}#${i} ${left}`);
      });
    }
    expect(partial).toEqual([]);
  });

  it("no fill-in prompt shows its own answer in brackets", () => {
    // Checks the prompt the learner sees, not the authored hint: dropping a hint brings back the pack's
    // own bracket, and "Yo voy a ___ (comprar) un regalo" with the answer "comprar" passed every other test.
    const bad: string[] = [];
    for (const pack of packs) {
      if (pack.kind !== "cloze") continue;
      for (const q of packQuestions(pack)) {
        if (q.type !== "mc" && q.type !== "fill") continue;
        const answer = (q.type === "mc" ? q.choices[q.answer]! : q.answer).toLowerCase();
        for (const m of q.prompt.matchAll(/\(([^)]*)\)/g))
          if (m[1]!.trim().toLowerCase() === answer) bad.push(`${q.id}: ${q.prompt}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("no written wrong option contains the answer or sits inside it", () => {
    const bad: string[] = [];
    for (const [id, rows] of Object.entries(ROMANCE_CLOZE)) {
      const data = lines(packs.find((p) => p.id === id)!);
      for (const [i, row] of Object.entries(rows)) {
        const answer = data[Number(i)]![1]!;
        for (const w of row.wrong)
          if (optionsOverlap(answer, w)) bad.push(`${id}#${i}: "${w}" for "${answer}"`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("a clue is added only where the line has one authored, and replaces a bracketed word", () => {
    const qs = packQuestions(packs.find((p) => p.id === "esa2p4")!);
    expect(qs[1]!.type === "mc" || qs[1]!.type === "fill").toBe(true);
    expect((qs[1] as { prompt: string }).prompt).toBe("El coche es muy ___ (fast).");
    const neg = packQuestions(packs.find((p) => p.id === "fra2p15")!);
    expect((neg[1] as { prompt: string }).prompt).toBe("Il ne mange ___ de viande. (never)");
  });

  it("no negation line offers a second right answer without a clue", () => {
    for (const q of packQuestions(packs.find((p) => p.id === "fra2p15")!))
      expect((q as { prompt: string }).prompt, q.id).toMatch(/\([a-z ]+\)$/);
  });
});

describe("listening packs: the choices can be told apart by ear", () => {
  it("catches choices that sound the same, and spares ones a possessive tells apart", () => {
    expect(homophoneOnly("Ces photos sont anciennes.", "Ses photos sont anciennes.")).toBe(true);
    expect(homophoneOnly("J'aime beaucoup le pain.", "J'aime beaucoup le pin.")).toBe(true);
    expect(homophoneOnly("Le cou me fait mal.", "Le coup me fait mal.")).toBe(true);
    expect(homophoneOnly("Hablamos de la casa.", "Hablamos de la caza.")).toBe(true);
    expect(homophoneOnly("Nunca aprendí a cocer rápido.", "Nunca aprendí a coser rápido.")).toBe(
      true,
    );
    expect(homophoneOnly("J'aime beaucoup ma mère.", "J'aime beaucoup la mer.")).toBe(false);
    expect(homophoneOnly("Ce plat contient du poisson.", "Ce plat contient du poison.")).toBe(
      false,
    );
    expect(homophoneOnly("Le dessus est propre.", "Le dessous est propre.")).toBe(false);
  });

  it("no A1/A2 listening question offers a wrong choice that is a homophone of the answer", () => {
    const bad: string[] = [];
    let n = 0;
    for (const pack of packs) {
      if (pack.kind !== "listening") continue;
      for (const q of packQuestions(pack)) {
        if (q.type !== "listening") continue;
        n++;
        for (const c of q.choices)
          if (c !== q.answer && homophoneOnly(q.answer, c)) bad.push(`${q.id}: ${c}`);
      }
    }
    expect(n).toBe(100);
    expect(bad).toEqual([]);
  });
});

// What this guards (docs/distractor-policy.md, "Placement banks"): the French and Spanish placement
// tests. They decide a learner's starting level, and were never covered by the lesson-bank gates.
// The rules that generalise without a part-of-speech tagger are checked on the sentence the KEY makes
// and on the words the learner reads; the judgement calls (a second defensible answer, a wrong band)
// stay a human review, written into the PR.
describe("the French and Spanish placement banks", () => {
  const banks = [
    ["fr", PLACEMENT_QUESTIONS_FR],
    ["es", PLACEMENT_QUESTIONS_ES],
  ] as const;
  const mc = (pool: PlacementQuestion[]) => pool.flatMap((q) => (q.type === "mc" ? [q] : []));
  const keyOf = (q: Extract<PlacementQuestion, { type: "mc" }>) => q.choices[q.answer]!;

  // Words that only English has. Quoted glosses ("thank you") and bracketed hints ("(to go)") are the
  // course's deliberate English and are removed first. "formal", "correct" and the like are shared with the
  // Romance languages and are not listed.
  const ENGLISH =
    /\b(the|is|are|choose|closest|introduces|equivalent|meaning|means|which|most|number|for)\b/i;
  const withoutGlosses = (t: string) =>
    t.replace(/["“«][^"”»]*["”»]/g, " ").replace(/\([^)]*\)/g, " ");

  // Options that shipped in the placement banks and are not words a learner would ever choose; kept so
  // they cannot come back. Each was found by the placement-question-quality review.
  const RETIRED = [
    "chère que",
    "restâmes",
    "trop des",
    "beaucoup de trucs de preuve",
    "vers le magasin marchant, la pluie a commencé.",
    "la réduction des coûts en œuvre",
    "l'entreprise de réduction des coûts",
    "mucha cosa de pruebas",
    "hacia la tienda caminando, empezó a llover.",
    "la lluvia, caminando hacia la tienda, empezó.",
    "mejora",
    "más caro",
  ];

  it("no question speaks English outside a quoted gloss or a bracketed hint", () => {
    const bad: string[] = [];
    for (const [lang, pool] of banks)
      for (const q of mc(pool)) {
        for (const text of [q.prompt, ...q.choices])
          if (ENGLISH.test(withoutGlosses(text))) bad.push(`${lang} ${q.id}: ${text}`);
      }
    expect(bad).toEqual([]);
  });

  it("the sentence the key makes is not broken: no doubled word, no uncontracted article", () => {
    const bad: string[] = [];
    for (const [lang, pool] of banks)
      for (const q of mc(pool)) {
        if (!q.prompt.includes("___")) continue;
        const filled = q.prompt.replace("___", keyOf(q));
        if (/(^|[\s¿])(\p{L}+)\s+\2(?![\p{L}])/iu.test(filled))
          bad.push(`${lang} ${q.id}: repeats a word -> ${filled}`);
        // Spanish a/de + el, French à/de + le/les, are always contracted (al, del, au, du, aux, des).
        if (/(^|\s)(de|a) el(\s|$)/.test(filled) || /(^|\s)(de|à) (le|les)(\s|$)/.test(filled))
          bad.push(`${lang} ${q.id}: uncontracted article -> ${filled}`);
      }
    expect(bad).toEqual([]);
  });

  it("a Spanish question opens with the inverted mark it closes with", () => {
    const bad = mc(PLACEMENT_QUESTIONS_ES)
      .filter((q) => /\?\s*$/.test(q.prompt) && !q.prompt.includes("¿"))
      .map((q) => q.id);
    expect(bad).toEqual([]);
  });

  it("no retired absurd option is back", () => {
    const bad: string[] = [];
    for (const [lang, pool] of banks)
      for (const q of mc(pool))
        for (const c of q.choices)
          if (RETIRED.includes(c.trim().toLowerCase())) bad.push(`${lang} ${q.id}: ${c}`);
    expect(bad).toEqual([]);
  });

  it("the gate itself rejects the defects it was written for", () => {
    expect(ENGLISH.test(withoutGlosses("Choose the correct number for five"))).toBe(true);
    expect(ENGLISH.test(withoutGlosses('Comment dit-on "thank you" en français ?'))).toBe(false);
    expect(ENGLISH.test(withoutGlosses("Hier, je ___ (to go) au marché."))).toBe(false);
  });
});
