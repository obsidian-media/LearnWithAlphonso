import { getCourse } from "@/data/courses";
import { PLACEMENT_QUESTIONS } from "@/data/placement";
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

export type EnglishDump = {
  byLevel: Record<Level, DumpedQuestion[]>;
  placement: DumpedQuestion[];
  totals: { curriculum: number; placement: number };
};

export function buildEnglishDump(): EnglishDump {
  const { questionIndex } = getCourse("en");
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
            audioText: q.audioText,
            imageKey: q.imageKey,
          }
        : q.type === "fill"
          ? { ...base, bank: q.bank, answer: q.answer }
          : { ...base, tokens: q.tokens, answer: q.answer };
    byLevel[ref.level].push(dumped);
    curriculumCount++;
  }

  for (const level of ALL_LEVELS) {
    byLevel[level].sort((a, b) => a.key.localeCompare(b.key));
  }

  const placement: DumpedQuestion[] = PLACEMENT_QUESTIONS.map((p) => ({
    key: `placement:${p.id}`,
    level: p.level,
    unitId: "placement",
    lessonId: "placement",
    questionId: p.id,
    type: "mc",
    prompt: p.prompt,
    choices: p.choices,
    answer: p.choices[p.answer] ?? "",
    explanation: "",
  }));

  return {
    byLevel,
    placement,
    totals: { curriculum: curriculumCount, placement: placement.length },
  };
}
