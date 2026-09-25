import { describe, expect, it } from "vitest";
import { curriculum } from "./curriculum";
import { curriculumFr } from "./curriculum-fr";
import { curriculumEs } from "./curriculum-es";
import { VOCAB_IMAGES } from "./vocab-images";
import { normaliseWritten } from "../lib/translation-answer";
import type { Lesson, Question, Unit } from "./curriculum";

/**
 * Automated content-consistency scan across all 3 course content banks
 * (English/French/Spanish, ~510/500/508 lessons respectively as of
 * 2026-09-22). Scoped deliberately: this catches mechanical/structural
 * bugs (broken answer references, duplicate ids, orphaned image keys,
 * empty fields) that are wrong regardless of language -- it does NOT
 * judge grammar correctness, idiom naturalness, or translation quality.
 * A real native-speaker review pass (flagged open in docs/BACKLOG.md
 * for French and Spanish) is a different, human task this doesn't
 * replace. See docs/BACKLOG.md "Harden the 3 existing courses" for the
 * full context this was written under.
 */

type CourseFixture = { name: string; units: Unit[] };

const courses: CourseFixture[] = [
  { name: "en", units: curriculum },
  { name: "fr", units: curriculumFr },
  { name: "es", units: curriculumEs },
];

function allLessons(units: Unit[]): { unit: Unit; lesson: Lesson }[] {
  return units.flatMap((unit) => unit.lessons.map((lesson) => ({ unit, lesson })));
}

function allQuestions(units: Unit[]): { unit: Unit; lesson: Lesson; question: Question }[] {
  return allLessons(units).flatMap(({ unit, lesson }) =>
    lesson.questions.map((question) => ({ unit, lesson, question })),
  );
}

describe.each(courses)("curriculum consistency ($name)", ({ name, units }) => {
  it("has no duplicate unit ids", () => {
    const ids = units.map((u) => u.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes, `duplicate unit ids in ${name}: ${dupes.join(", ")}`).toEqual([]);
  });

  it("has no duplicate lesson ids", () => {
    const ids = allLessons(units).map(({ lesson }) => lesson.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes, `duplicate lesson ids in ${name}: ${dupes.join(", ")}`).toEqual([]);
  });

  it("has no duplicate question ids within a single lesson", () => {
    const offenders: string[] = [];
    for (const { lesson } of allLessons(units)) {
      const ids = lesson.questions.map((q) => q.id);
      const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
      if (dupes.length > 0) offenders.push(`${lesson.id}: ${dupes.join(", ")}`);
    }
    expect(offenders, `duplicate question ids: ${offenders.join(" | ")}`).toEqual([]);
  });

  it("every lesson has at least one question", () => {
    const empty = allLessons(units)
      .filter(({ lesson }) => lesson.questions.length === 0)
      .map(({ lesson }) => lesson.id);
    expect(empty, `lessons with zero questions in ${name}: ${empty.join(", ")}`).toEqual([]);
  });

  it("translate questions: at least three distinct non-empty acceptable phrasings", () => {
    // One phrasing makes the AI fallback carry the whole question, and an
    // empty list makes matchesAcceptableAnswer reject everything -- a question
    // nobody can answer, which is worse than a wrong one because it is silent.
    const offenders: string[] = [];
    for (const { lesson, question } of allQuestions(units)) {
      if (question.type !== "translate") continue;
      const key = `${lesson.id}:${question.id}`;
      const answers = question.acceptableAnswers;
      // Three, matching what the packs and the audit log claim. Two is the
      // point at which the AI fallback starts carrying the question, and every
      // wording the list misses is a vendor call.
      if (answers.length < 3) {
        offenders.push(`${key}: only ${answers.length} acceptable phrasing(s)`);
        continue;
      }
      if (answers.some((a) => a.trim().length === 0)) {
        offenders.push(`${key}: has a blank acceptable phrasing`);
        continue;
      }
      // Deduped with the REAL matching rule, not a trim/lowercase. Matching
      // runs through normaliseWritten, which expands contractions -- so
      // "What's your name?" and "What is your name?" are one wording, not two,
      // and a list of three that collapses to two is really a list of two. The
      // cheaper check passed those happily, which is how a1p25 shipped nine
      // such lines.
      const normalized = answers.map((a) => normaliseWritten(a));
      if (new Set(normalized).size !== normalized.length) {
        offenders.push(`${key}: acceptable phrasings that are identical once normalised`);
      }
    }
    expect(offenders, `translate problems in ${name}: ${offenders.join(" | ")}`).toEqual([]);
  });

  it("mc questions: answer index is within range of choices, and choices have no duplicates", () => {
    const offenders: string[] = [];
    for (const { lesson, question } of allQuestions(units)) {
      if (question.type !== "mc") continue;
      const key = `${lesson.id}:${question.id}`;
      if (question.answer < 0 || question.answer >= question.choices.length) {
        offenders.push(
          `${key}: answer index ${question.answer} out of range for ${question.choices.length} choices`,
        );
        continue;
      }
      const normalized = question.choices.map((c) => c.trim().toLowerCase());
      const dupes = normalized.filter((c, i) => normalized.indexOf(c) !== i);
      if (dupes.length > 0) {
        offenders.push(`${key}: duplicate choice text (${[...new Set(dupes)].join(", ")})`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("mc questions: no empty prompt, choice, or explanation strings", () => {
    const offenders: string[] = [];
    for (const { lesson, question } of allQuestions(units)) {
      if (question.type !== "mc") continue;
      const key = `${lesson.id}:${question.id}`;
      if (!question.prompt.trim()) offenders.push(`${key}: empty prompt`);
      if (!question.explanation.trim()) offenders.push(`${key}: empty explanation`);
      question.choices.forEach((c, i) => {
        if (!c.trim()) offenders.push(`${key}: empty choice at index ${i}`);
      });
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("mc questions: imageKey (when present) resolves to a real VOCAB_IMAGES entry", () => {
    const offenders: string[] = [];
    for (const { lesson, question } of allQuestions(units)) {
      if (question.type !== "mc" || !question.imageKey) continue;
      if (!(question.imageKey in VOCAB_IMAGES)) {
        offenders.push(
          `${lesson.id}:${question.id}: imageKey "${question.imageKey}" not in VOCAB_IMAGES`,
        );
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("fill questions: the correct answer is actually offered in the word bank", () => {
    const offenders: string[] = [];
    for (const { lesson, question } of allQuestions(units)) {
      if (question.type !== "fill") continue;
      const inBank = question.bank.some(
        (b) => b.trim().toLowerCase() === question.answer.trim().toLowerCase(),
      );
      if (!inBank) {
        offenders.push(
          `${lesson.id}:${question.id}: answer "${question.answer}" not present in bank [${question.bank.join(", ")}]`,
        );
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("listening questions: have spoken audio, and the answer is among the choices", () => {
    const offenders: string[] = [];
    for (const { lesson, question } of allQuestions(units)) {
      if (question.type !== "listening") continue;
      if (!question.audioText.trim()) {
        offenders.push(`${lesson.id}:${question.id}: empty audioText -- unanswerable`);
      }
      if (!question.choices.includes(question.answer)) {
        offenders.push(
          `${lesson.id}:${question.id}: answer "${question.answer}" not present in choices [${question.choices.join(", ")}]`,
        );
      }
      const lowered = question.choices.map((c) => c.trim().toLowerCase());
      if (new Set(lowered).size !== question.choices.length) {
        offenders.push(`${lesson.id}:${question.id}: duplicate choices`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("fill questions: prompt contains a blank, and bank has no duplicate/empty entries", () => {
    const offenders: string[] = [];
    for (const { lesson, question } of allQuestions(units)) {
      if (question.type !== "fill") continue;
      const key = `${lesson.id}:${question.id}`;
      if (!question.prompt.includes("___")) offenders.push(`${key}: prompt has no ___ blank`);
      const normalized = question.bank.map((b) => b.trim().toLowerCase());
      if (normalized.some((b) => b === "")) offenders.push(`${key}: empty bank entry`);
      const dupes = normalized.filter((b, i) => normalized.indexOf(b) !== i);
      if (dupes.length > 0)
        offenders.push(`${key}: duplicate bank entries (${[...new Set(dupes)].join(", ")})`);
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("reorder questions: answer is reconstructable from the exact token multiset", () => {
    const offenders: string[] = [];
    for (const { lesson, question } of allQuestions(units)) {
      if (question.type !== "reorder") continue;
      const key = `${lesson.id}:${question.id}`;
      const answerWords = question.answer.split(" ").filter(Boolean);
      const tokenMultiset = [...question.tokens].sort();
      const answerMultiset = [...answerWords].sort();
      if (JSON.stringify(tokenMultiset) !== JSON.stringify(answerMultiset)) {
        offenders.push(
          `${key}: answer words [${answerMultiset.join(", ")}] don't match token pool [${tokenMultiset.join(", ")}]`,
        );
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("question ids match the ^[a-z0-9]+$ pattern the server-side item-key validators require", () => {
    // recordMisses/gradeReview (review.functions.ts) regex-validate item
    // keys as `${lessonId}:${questionId}` against /^[a-z0-9]+:[a-z0-9]+$/.
    // A content-authored id outside that pattern would make the question
    // permanently unreviewable (silently rejected server-side, not a
    // visible crash) -- worth catching here rather than live.
    const offenders: string[] = [];
    const idPattern = /^[a-z0-9]+$/;
    for (const { lesson } of allLessons(units)) {
      if (!idPattern.test(lesson.id)) offenders.push(`lesson id "${lesson.id}" fails pattern`);
      for (const question of lesson.questions) {
        if (!idPattern.test(question.id)) {
          offenders.push(`${lesson.id}:${question.id}: question id fails pattern`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("has no duplicate prompt text across different packs", () => {
    // spec docs/superpowers/specs/2026-09-24-french-content-audit-design.md
    // section 6.3 item 3: the same sentence in two packs yields two ids that a
    // learner experiences as a repeat. Trailing "___" is stripped before
    // comparing -- the same pack line can compile to an mc question (no
    // suffix) in one context and a fill question (" ___" appended by
    // bank-engine.ts) in another, and those must still be recognized as the
    // same underlying prompt.
    const byPrompt = new Map<string, { key: string; packId: string; answer: string }[]>();
    for (const { lesson, question } of allQuestions(units)) {
      const packId = question.id.replace(/q\d+$/, "");
      // "listening" and "speak" questions each share one fixed instructional
      // prompt ("What did you hear?" / "Say this aloud:") across every
      // question of that type in the course by design -- the content being
      // compared is audioText/answer, not prompt. Using prompt here would
      // flag every listening (or speak) question as a duplicate of every
      // other one of its type.
      const dedupText =
        question.type === "listening"
          ? question.audioText
          : question.type === "speak"
            ? question.answer
            : question.prompt;
      const norm = dedupText
        .trim()
        .replace(/\s*___\s*$/, "")
        .toLowerCase();
      if (!byPrompt.has(norm)) byPrompt.set(norm, []);
      const anyQ = question as unknown as { choices?: string[]; answer: unknown };
      const answer = Array.isArray(anyQ.choices)
        ? anyQ.choices[anyQ.answer as number]
        : String(anyQ.answer);
      byPrompt
        .get(norm)!
        .push({ key: `${lesson.id}:${question.id}`, packId, answer: String(answer) });
    }
    const crossPackDupes: string[] = [];
    for (const [prompt, group] of byPrompt) {
      const packs = new Set(group.map((g) => g.packId));
      if (packs.size > 1) {
        crossPackDupes.push(
          `"${prompt}" -> ${group.map((g) => `${g.key}(${g.answer})`).join(", ")}`,
        );
      }
    }
    if (name === "fr") {
      // French was fully audited and fixed (french-content-audit-log.md) --
      // hold it at zero so a future content addition can't silently
      // reintroduce a duplicate.
      expect(crossPackDupes, crossPackDupes.join("\n")).toEqual([]);
    } else {
      // English/Spanish were not audited this session (spec section 11) --
      // report-only so this test doesn't start gating content nobody has
      // reviewed for false positives.
      if (crossPackDupes.length > 0) {
        console.log(
          `${name}: ${crossPackDupes.length} cross-pack duplicate prompt groups (not gated):`,
        );
        console.log(crossPackDupes.join("\n"));
      }
    }
  });

  it("has no mojibake or replacement characters in any question text", () => {
    const offenders: string[] = [];
    for (const { lesson, question } of allQuestions(units)) {
      const anyQ = question as unknown as {
        prompt: string;
        explanation?: string;
        choices?: string[];
        bank?: string[];
      };
      const texts = [
        anyQ.prompt,
        anyQ.explanation ?? "",
        ...(anyQ.choices ?? []),
        ...(anyQ.bank ?? []),
      ];
      for (const t of texts) {
        if (t.includes("�")) {
          offenders.push(`${lesson.id}:${question.id}: replacement char (U+FFFD) in "${t}"`);
        }
        // A UTF-8 byte sequence re-decoded as Latin-1 turns e.g. "é" into
        // "Ã©" -- this pattern is never legitimate content in any of the
        // three courses.
        if (/Ã[\x80-\xBF]/.test(t)) {
          offenders.push(`${lesson.id}:${question.id}: mojibake pattern "Ã." in "${t}"`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  if (name === "fr") {
    it("French: every known accented/typographic character still appears somewhere in the bank", () => {
      // Verified 2026-09-24 by scanning lesson-bank-fr.ts source directly: 18
      // distinct non-ASCII characters. This is a floor, not a per-question
      // check -- it catches a whole character class silently disappearing
      // (e.g. an export step stripping diacritics), which the mojibake check
      // above cannot see since a missing character isn't a corrupted one.
      const expectedChars = [
        "À",
        "Ç",
        "Ê",
        "à",
        "â",
        "ç",
        "è",
        "é",
        "ê",
        "ë",
        "î",
        "ô",
        "ù",
        "û",
        "œ",
        "–",
        "—",
        "…",
      ];
      const questionText = allQuestions(units)
        .map(({ question }) => {
          const anyQ = question as unknown as {
            prompt: string;
            explanation?: string;
            choices?: string[];
            bank?: string[];
          };
          return [
            anyQ.prompt,
            anyQ.explanation ?? "",
            ...(anyQ.choices ?? []),
            ...(anyQ.bank ?? []),
          ].join(" ");
        })
        .join(" ");
      // Ê/– /—/… live mostly in pack titles/subtitles/notes (compiled onto
      // Unit/Lesson, not Question), not in prompt/answer/choice text -- scan
      // those too so this floor reflects the bank's real character set.
      const unitText = units
        .map((u) =>
          [u.title, u.description, ...u.lessons.flatMap((l) => [l.title, l.subtitle])].join(" "),
        )
        .join(" ");
      const allText = questionText + " " + unitText;
      const missing = expectedChars.filter((c) => !allText.includes(c));
      expect(missing, `missing characters: ${missing.join(" ")}`).toEqual([]);
    });
  }
});
