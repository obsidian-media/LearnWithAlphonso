// The lesson-mix review panel's glue: a new record becomes the ReviewItem the closure-run panel reads
// (Sonnet reads every item, Mistral every flag plus 10%, the Opus judge decides the flagged), and a
// judge's patch comes back into the record. The rubric, chunking, parsing, sampling and judge logic are
// the closure run's (src/lib/content-review/), unchanged. Pure.

import type { Course } from "../../data/course-meta";
import type { Level } from "../../data/levels";
import { hash } from "../../data/bank-engine";
import { renderQuestion } from "../content-panel/panel";
import { checkFix, type Patch, type ProposedFix } from "../content-review/fixes";
import type { ReviewItem } from "../content-review/inventory";
import { toQuestion, type ExtraType, type LessonExtra } from "./extras";

export const extraItemId = (course: Course, lessonId: string, type: ExtraType) => {
  const q = toQuestion(lessonId, type, {
    listening: { prompt: "", audioText: "", wrong: [], explanation: "" },
    speak: { answer: "", explanation: "" },
    translate: { prompt: "", acceptableAnswers: [], explanation: "" },
  });
  return `${course}:question:${lessonId}/${q!.id}`;
};

export function toReviewItem(args: {
  course: Course;
  level: Level;
  lessonId: string;
  lessonTitle: string;
  type: ExtraType;
  extra: LessonExtra;
}): ReviewItem | null {
  const q = toQuestion(args.lessonId, args.type, args.extra);
  if (!q) return null;
  const text = `lesson: ${args.lessonTitle} (${args.level}); a NEW question appended to this lesson\n${renderQuestion(q)}`;
  return {
    id: `${args.course}:question:${args.lessonId}/${q.id}`,
    course: args.course,
    kind: "question",
    subtype: q.type,
    level: args.level,
    source: `src/data/lesson-extras/${args.course}.json`,
    text,
    hash: (hash(text) >>> 0).toString(36),
    data: q as unknown as Record<string, unknown>,
  };
}

/** Splits a review item id back into its lesson and type. */
export function parseItemId(
  id: string,
): { course: Course; lessonId: string; type: ExtraType } | null {
  const m = /^(en|fr|es):question:([a-z0-9]+)\/(lx1|sx1|tx1)$/.exec(id);
  if (!m) return null;
  const type = m[3] === "lx1" ? "listening" : m[3] === "sx1" ? "speak" : "translate";
  return { course: m[1] as Course, lessonId: m[2]!, type };
}

/** A judge's checked patch applied to the record. A field this type does not have is refused. */
export function applyPatch(type: ExtraType, extra: LessonExtra, patch: Patch): LessonExtra {
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : undefined);
  if (type === "listening" && extra.listening) {
    const l = extra.listening;
    const audioText = str(patch.audioText) ?? l.audioText;
    const choices = arr(patch.choices);
    // The patch lists the whole choice list with the answer in it; the record keeps only the wrong ones.
    const wrong = choices ? choices.filter((c) => c !== (str(patch.answer) ?? audioText)) : l.wrong;
    return {
      ...extra,
      listening: {
        prompt: str(patch.prompt) ?? l.prompt,
        audioText,
        wrong,
        explanation: str(patch.explanation) ?? l.explanation,
      },
    };
  }
  if (type === "speak" && extra.speak) {
    const s = extra.speak;
    return {
      ...extra,
      speak: {
        answer: str(patch.answer) ?? s.answer,
        explanation: str(patch.explanation) ?? s.explanation,
      },
    };
  }
  if (type === "translate" && extra.translate) {
    const t = extra.translate;
    return {
      ...extra,
      translate: {
        prompt: str(patch.prompt) ?? t.prompt,
        acceptableAnswers: arr(patch.acceptableAnswers) ?? t.acceptableAnswers,
        explanation: str(patch.explanation) ?? t.explanation,
      },
    };
  }
  return extra;
}

/** Checks a proposed fix with the closure run's constraints, then applies it. Refusals come back as reasons. */
export function checkedApply(
  item: ReviewItem,
  type: ExtraType,
  extra: LessonExtra,
  fix: ProposedFix,
): { extra: LessonExtra; refused: string[] } {
  const refused = checkFix(item, fix);
  if (refused.length) return { extra, refused };
  return { extra: applyPatch(type, extra, fix.patch), refused: [] };
}
