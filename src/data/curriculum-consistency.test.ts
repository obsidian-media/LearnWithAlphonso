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

/**
 * The correct answer as a learner would read it, for any question type.
 *
 * The previous version did `Array.isArray(choices) ? choices[answer] : String(answer)`,
 * which is wrong for two of the six types and made a real defect look like a
 * reporting bug. A `listening` question's `answer` is the choice TEXT, not an
 * index, so `choices["The bus leaves at nine."]` was undefined. A `translate`
 * question has no `choices` at all, so `String(undefined)` came out as the string
 * "undefined". Three of English's seven reported duplicates rendered as
 * `(undefined)` and read as an artifact of the report; they were real content
 * duplicates the report was simply unable to describe.
 */
function answerTextOf(question: Question): string {
  switch (question.type) {
    case "mc":
      return question.choices[question.answer] ?? "(no such choice)";
    case "fill":
    case "listening":
    case "speak":
    case "reorder":
      // reorder stores the correct sentence as text, tokens joined by spaces.
      return question.answer;
    case "translate":
      return question.acceptableAnswers[0] ?? "(no accepted answer)";
  }
}

/**
 * Prompts that are instructions rather than content.
 *
 * For these the prompt is identical by design and the material is in the
 * choices, exactly as for `listening` ("What did you hear?") and `speak` ("Say
 * this aloud:"), which this check already special-cases. Two hand-written
 * questions both headed "Choose the correct question." teach to-be inversion and
 * do/does respectively -- different questions, one instruction.
 *
 * Kept as an explicit list rather than a heuristic, because the cost of guessing
 * wrong is silence about a genuine repeat. A prompt only belongs here when the
 * questions sharing it are demonstrably different questions.
 */
const INSTRUCTIONAL_PROMPTS = new Set(["choose the correct question."]);

/**
 * Cross-pack duplicate prompt groups per course, as measured on 2026-09-25.
 *
 * Not a target -- a ratchet. The number is here so it is visible in review,
 * cannot drift silently, and has to be edited down deliberately when content is
 * fixed. A new duplicate fails the run with every finding in the message.
 *
 *   fr  0  audited and fixed (french-content-audit-log.md); hold at zero.
 *   en  0  audited and fixed 2026-09-25. Was 7 as reported, and actually 9 once
 *          hand-written units stopped collapsing into one pseudo-pack: 8 genuine
 *          duplicates plus one instructional-prompt false positive, now excluded
 *          by INSTRUCTIONAL_PROMPTS rather than by tolerating a non-zero count.
 *   es  57 not yet audited. Owned by the Spanish session; lower this as they fix
 *          them. Left gated rather than silent so the count cannot grow.
 */
const CROSS_PACK_DUPLICATE_BASELINE: Record<string, number> = {
  en: 0,
  fr: 0,
  es: 57,
};

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
    //
    // This check was report-only for en/es until 2026-09-25, and vitest
    // intercepts console output, so a normal run printed 46/46 passed and said
    // nothing while holding 7 English and 57 Spanish findings. It found the
    // defect and threw it away. Each course now asserts against a recorded
    // count (CROSS_PACK_DUPLICATE_BASELINE) so the number lives in the file,
    // has to be edited down as content is fixed, and fails loudly on a new one.
    const byPrompt = new Map<string, { key: string; packId: string; answer: string }[]>();
    for (const { lesson, question } of allQuestions(units)) {
      // A pack question's id is `${packId}q${i}`. A hand-written unit question's
      // id is just `q7`, so this replace yielded "" for all of them and every
      // hand-written question across every unit collapsed into one pseudo-pack
      // -- which made duplicates BETWEEN hand-written units invisible. It hid
      // two real ones in English ("Can I pay ___ card?" in u3l2 and u5l1, same
      // answer, and a false positive worth keeping visible). Hand-written
      // content falls back to its unit, taken from the lesson id (`u3l2` -> `u3`).
      const packId = question.id.replace(/q\d+$/, "") || lesson.id.replace(/l\d+.*$/, "");
      // "listening" and "speak" questions each share one fixed instructional
      // prompt ("What did you hear?" / "Say this aloud:") across every
      // question of that type in the course by design -- the content being
      // compared is audioText/answer, not prompt. Using prompt here would
      // flag every listening (or speak) question as a duplicate of every
      // other one of its type.
      //
      // Hand-written multiple choice has the same shape: "Choose the correct
      // question." is an instruction, and the content is in the choices. Two
      // such questions teaching different grammar (to-be inversion vs do/does)
      // are not duplicates. Compare their correct answer instead.
      const dedupText =
        question.type === "listening"
          ? question.audioText
          : question.type === "speak"
            ? question.answer
            : INSTRUCTIONAL_PROMPTS.has(question.prompt.trim().toLowerCase())
              ? `${question.prompt} :: ${answerTextOf(question)}`
              : question.prompt;
      const norm = dedupText
        .trim()
        .replace(/\s*___\s*$/, "")
        .toLowerCase();
      if (!byPrompt.has(norm)) byPrompt.set(norm, []);
      byPrompt.get(norm)!.push({
        key: `${lesson.id}:${question.id}`,
        packId,
        answer: answerTextOf(question),
      });
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
    // The message carries every finding, because that is the only channel a
    // vitest run reliably shows. Nothing here relies on console output.
    expect(
      crossPackDupes.length,
      `${name}: expected ${CROSS_PACK_DUPLICATE_BASELINE[name]} cross-pack duplicate ` +
        `prompt groups, found ${crossPackDupes.length}. If you fixed one, lower the ` +
        `baseline in this file; if this rose, you added a repeat:\n${crossPackDupes.join("\n")}`,
    ).toBe(CROSS_PACK_DUPLICATE_BASELINE[name]);
  });

  it("only exempts a shared prompt when the questions behind it really differ", () => {
    // Guards INSTRUCTIONAL_PROMPTS, which is a genuine need -- "Choose the
    // correct question." is an instruction and the material is in the choices --
    // and also, on the face of it, a way to make a real duplicate disappear
    // without fixing it.
    //
    // It turns out to be largely self-limiting, and the mutation that proved it
    // is worth recording, because the first version of this comment claimed more
    // than was true. Exempting a prompt swaps its dedup key from the prompt to
    // `prompt :: answer`, so two questions that share a prompt AND an answer keep
    // an IDENTICAL key and are still counted as duplicates. Reintroducing a real
    // repeat and then exempting its prompt still fails the count above.
    //
    // What this test adds is therefore narrow but real. First, a precise message:
    // the count says "you added a repeat", this says the exemption itself is
    // illegitimate. Second, and the reason it stays: the count is only decisive
    // for a course held at ZERO. Spanish sits at 57 while its audit is pending, so
    // there one more same-answer duplicate hides inside the allowance -- this
    // check names it whatever the baseline is.
    //
    // The discriminator is the answer. Two questions sharing a prompt and an
    // answer are the same question however the prompt is worded; two sharing only
    // an instruction are different questions wearing one label.
    for (const prompt of INSTRUCTIONAL_PROMPTS) {
      const answers = allQuestions(units)
        .filter(({ question }) => question.prompt.trim().toLowerCase() === prompt)
        .map(({ lesson, question }) => ({
          key: `${lesson.id}:${question.id}`,
          answer: answerTextOf(question),
        }));
      if (answers.length < 2) continue; // not shared in this course; nothing to exempt
      const distinct = new Set(answers.map((a) => a.answer.trim().toLowerCase()));
      expect(
        distinct.size,
        `"${prompt}" is exempted as instructional, but these questions share an ` +
          `answer, which makes them the same question rather than a shared ` +
          `instruction: ${answers.map((a) => `${a.key}(${a.answer})`).join(", ")}`,
      ).toBe(answers.length);
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
