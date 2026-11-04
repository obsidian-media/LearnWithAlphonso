// Mixed question formats for the English A1/A2 lessons.
//
// Most A1/A2 packs are pick-the-word only. This overlay appends, to the END of each lesson that
// lacks them: one reorder question, one listening question and one translate question. Existing
// ids, answers and answer positions never move (ids of the new questions continue after the last
// existing id; docs/superpowers/specs and src/lib/id-parity.test.ts guard that).
//
// - reorder: one cloze sentence of 3-8 words, filled in and shuffled.
// - listening: a different sentence of the lesson, read aloud by the existing text-to-speech; the
//   wrong choices are the same sentence with a wrong cloze option in the blank, or other sentences
//   of the lesson.
// - translate: authored per lesson in question-variety-translate.ts (an idea, not the sentence,
//   with two or three accepted wordings).

import { hash } from "./bank-engine";
import type { Lesson, Question, Unit } from "./curriculum";
import { TRANSLATE_IDEAS } from "./question-variety-translate";

const MIN_WORDS = 3;
const MAX_WORDS = 8;

/** Comparison key for "is this the same sentence": lower case, no punctuation. */
const key = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const stripClue = (s: string) => s.replace(/\s*\([^)]*\)\s*$/, "").trim();
const stripEnd = (s: string) => s.trim().replace(/[.!?]+$/, "");

type Sentence = { text: string; wrongs: string[] };

const wholeWord = (w: string) =>
  new RegExp("\\b" + w.replace(/[.*+?^$()|[\]\\]/g, "\\$&") + "\\b", "i");

/** Whole sentences the lesson already teaches, with the wrong options of the cloze they came from. */
export function lessonSentences(lesson: Lesson): Sentence[] {
  const out: Sentence[] = [];
  const seen = new Set<string>();
  const push = (text: string, wrongs: string[]) => {
    const t = text.trim().replace(/\s+([?.!,;])/g, "$1");
    const n = wordCount(t);
    // One whole sentence only: no "Plural of ...:" stems, no question-and-answer pairs.
    if (
      n < MIN_WORDS ||
      n > MAX_WORDS ||
      !/^[A-Z]/.test(t) ||
      /\b[ap]\.m\./i.test(t) ||
      /[:"]|\?\s+\S|[.!]\s+\S/.test(t) ||
      /^(plural|opposite|female form|comparative|superlative|past simple|noun form|which|how often)\b/i.test(
        t,
      ) ||
      seen.has(t.toLowerCase())
    )
      return;
    seen.add(t.toLowerCase());
    out.push({ text: t, wrongs });
  };
  for (const q of lesson.questions) {
    if ((q.type === "mc" || q.type === "fill") && q.prompt.includes("___")) {
      const answer = q.type === "mc" ? q.choices[q.answer]! : q.answer;
      const options = q.type === "mc" ? q.choices : q.bank;
      const base = stripClue(q.prompt);
      push(
        base.replace("___", answer),
        options.filter((o) => o !== answer).map((w) => base.replace("___", w)),
      );
    }
  }
  for (const q of lesson.questions) {
    const example = (q as { example?: string }).example;
    if (!example) continue;
    // Swap the card's answer for the question's wrong options: the same sentence, one word apart.
    const answer = q.type === "mc" ? q.choices[q.answer] : q.type === "fill" ? q.answer : undefined;
    const options = q.type === "mc" ? q.choices : q.type === "fill" ? q.bank : [];
    const at = answer ? wholeWord(answer) : null;
    const wrongs =
      answer && at && at.test(example)
        ? options.filter((o) => o !== answer).map((o) => example.replace(at, o))
        : [];
    push(example, wrongs);
  }
  return out.sort((a, b) => hash(lesson.id + a.text) - hash(lesson.id + b.text));
}

function reorderQuestion(id: string, lessonId: string, sentence: string): Question {
  const answer = stripEnd(sentence);
  const words = answer.split(/\s+/);
  // Deterministic shuffle that never leaves the words in order.
  let tokens = [...words].sort(
    (a, b) => hash(lessonId + a + words.indexOf(a)) - hash(lessonId + b + words.indexOf(b)),
  );
  if (tokens.join(" ") === answer) tokens = [...words.slice(1), words[0]!];
  return {
    id,
    type: "reorder",
    prompt: "Put the words in order to make a sentence.",
    tokens,
    answer,
    explanation: `Correct order: "${sentence.trim()}"`,
  };
}

function listeningQuestion(id: string, lessonId: string, s: Sentence, others: string[]): Question {
  const wrongs: string[] = [];
  for (const w of [...s.wrongs, ...others]) {
    const key = w.trim();
    if (key !== s.text && !wrongs.includes(key)) wrongs.push(key);
    if (wrongs.length === 3) break;
  }
  const choices = [s.text, ...wrongs].sort((a, b) => hash(a + lessonId) - hash(b + lessonId));
  return {
    id,
    type: "listening",
    prompt: "Which sentence did you hear?",
    audioText: s.text,
    choices,
    answer: s.text,
    explanation: `The audio says "${s.text}"`,
  };
}

/** Questions to append to a lesson (none when it already has all three formats or no source). */
export function varietyQuestions(
  lesson: Lesson,
  nextIds: [string, string, string],
  pool: string[] = [],
  taken: Set<string> = new Set(),
): Question[] {
  const has = (t: Question["type"]) => lesson.questions.some((q) => q.type === t);
  const all = lessonSentences(lesson);
  // Never reuse a sentence another question (a speak, listening, reorder or translate one) already has.
  const free = all.filter((x) => !taken.has(key(x.text)));
  const sentences = free.length >= 2 ? free : all;
  if (sentences.length === 0) return [];
  const out: Question[] = [];
  const reorderSource = sentences[0]!;
  if (!has("reorder")) {
    out.push(reorderQuestion(nextIds[0], lesson.id, reorderSource.text));
    taken.add(key(reorderSource.text));
  }
  if (!has("listening")) {
    const source = sentences[1] ?? sentences[0]!;
    const others = [...sentences.filter((x) => x !== source).map((x) => x.text), ...pool];
    out.push(listeningQuestion(nextIds[1], lesson.id, source, others));
    taken.add(key(source.text));
  }
  const idea = TRANSLATE_IDEAS[lesson.id];
  if (!has("translate") && idea)
    out.push({
      id: nextIds[2],
      type: "translate",
      prompt: idea.idea,
      acceptableAnswers: idea.say,
      explanation: `One way to say it: "${idea.say[0]}"`,
    });
  return out;
}

/** The ids the three new questions get: they continue after the last id the lesson's pack uses. */
export function varietyIds(lesson: Lesson): [string, string, string] | null {
  const pack = /^(a[12]p\d+)l([1-5])$/.exec(lesson.id);
  if (pack) {
    const base = 25 + 3 * (Number(pack[2]) - 1);
    return [`${pack[1]}q${base}`, `${pack[1]}q${base + 1}`, `${pack[1]}q${base + 2}`];
  }
  // The hand-authored u1-u5 lessons already mix formats and stay as they are.
  return null;
}

export function addQuestionVariety(units: Unit[]): Unit[] {
  // Everything said or written elsewhere in the course, so a new question never repeats it.
  const taken = new Set<string>();
  for (const u of units)
    for (const l of u.lessons)
      for (const q of l.questions) {
        if (q.type === "speak" || q.type === "reorder") taken.add(key(q.answer));
        else if (q.type === "listening") taken.add(key(q.audioText));
        else if (q.type === "translate") for (const a of q.acceptableAnswers) taken.add(key(a));
      }
  return units.map((unit) => {
    if (unit.level !== "A1" && unit.level !== "A2") return unit;
    return {
      ...unit,
      lessons: unit.lessons.map((lesson) => {
        const ids = varietyIds(lesson);
        if (!ids) return lesson;
        const pool = unit.lessons
          .filter((l) => l !== lesson)
          .flatMap((l) => lessonSentences(l).map((x) => x.text));
        const extra = varietyQuestions(lesson, ids, pool, taken);
        return extra.length ? { ...lesson, questions: [...lesson.questions, ...extra] } : lesson;
      }),
    };
  });
}
