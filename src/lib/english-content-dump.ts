import { getCourse, type Course } from "@/data/courses";
import type { Level } from "@/data/levels";

// NB: `LEVELS` in levels.ts is `{ id, name, blurb }[]`, NOT `Level[]` --
// do not map over it to key a record. This mirrors what
// lesson-bank.ts's own generatedUnits() does.
const ALL_LEVELS: Level[] = ["A1", "A2", "B1", "B2", "C1"];

export type DumpedQuestion = {
  key: string;
  level: Level;
  unitId: string;
  lessonId: string;
  questionId: string;
  type: string;
  prompt: string;
  choices?: string[];
  bank?: string[];
  tokens?: string[];
  answer: string;
  explanation: string;
  audioText?: string;
  imageKey?: string;
};

export type CourseDump = {
  byLevel: Record<Level, DumpedQuestion[]>;
  placement: DumpedQuestion[];
  totals: { curriculum: number; placement: number };
};

export function buildCourseDump(course: Course = "en"): CourseDump {
  const { questionIndex, placementPool } = getCourse(course);
  const byLevel = Object.fromEntries(ALL_LEVELS.map((l) => [l, [] as DumpedQuestion[]])) as Record<
    Level,
    DumpedQuestion[]
  >;

  let curriculumCount = 0;
  for (const [key, ref] of Object.entries(questionIndex)) {
    const q = ref.question;
    const base = {
      key,
      level: ref.level,
      unitId: ref.unitId,
      lessonId: ref.lessonId,
      questionId: q.id,
      type: q.type,
      prompt: q.prompt,
      explanation: q.explanation,
    };
    const dumped: DumpedQuestion =
      q.type === "mc"
        ? {
            ...base,
            choices: q.choices,
            answer: q.choices[q.answer] ?? "",
            imageKey: q.imageKey,
          }
        : q.type === "speak"
          ? { ...base, answer: q.answer }
          : q.type === "translate"
            ? { ...base, bank: q.acceptableAnswers, answer: q.acceptableAnswers[0] ?? "" }
            : q.type === "listening"
              ? { ...base, choices: q.choices, answer: q.answer, audioText: q.audioText }
              : q.type === "fill"
                ? { ...base, bank: q.bank, answer: q.answer }
                : { ...base, tokens: q.tokens, answer: q.answer };
    byLevel[ref.level].push(dumped);
    curriculumCount++;
  }

  for (const level of ALL_LEVELS) {
    byLevel[level].sort((a, b) => a.key.localeCompare(b.key));
  }

  const placement: DumpedQuestion[] = placementPool.map((p) => {
    const base = {
      key: `placement:${p.id}`,
      level: p.level,
      unitId: "placement",
      lessonId: "placement",
      questionId: p.id,
      prompt: p.prompt,
      explanation: "",
    };
    // The placement pool is no longer mc-only: the exam assesses listening and
    // translation too (speaking is deliberately excluded -- see
    // PlacementQuestion's doc comment).
    if (p.type === "mc") {
      return { ...base, type: p.type, choices: p.choices, answer: p.choices[p.answer] ?? "" };
    }
    if (p.type === "listening") {
      return {
        ...base,
        type: p.type,
        choices: p.choices,
        answer: p.answer,
        audioText: p.audioText,
      };
    }
    return {
      ...base,
      type: p.type,
      bank: p.acceptableAnswers,
      answer: p.acceptableAnswers[0] ?? "",
    };
  });

  return {
    byLevel,
    placement,
    totals: { curriculum: curriculumCount, placement: placement.length },
  };
}
