import { describe, expect, it } from "vitest";
import { curriculum, type Question, type Unit } from "./curriculum";
import { curriculumFr } from "./curriculum-fr";
import { curriculumEs } from "./curriculum-es";
import { PLACEMENT_QUESTIONS, type PlacementQuestion } from "./placement";
import { PLACEMENT_QUESTIONS_FR } from "./placement-fr";
import { PLACEMENT_QUESTIONS_ES } from "./placement-es";

/**
 * The placement exam must not ask a question the course also teaches.
 *
 * This is a measurement problem, not a tidiness one. The exam decides which band
 * a learner starts in, and it draws candidates from a pool that is supposed to be
 * independent of the material. Where an item also exists as a lesson question,
 * anyone who has met it is scored on recall of that item instead of on level --
 * and the error only ever runs one way, upward, because recognising an item can
 * raise a score and never lowers it. A learner placed a band too high starts on
 * content they cannot do, which is the failure mode the whole placement suite
 * exists to prevent.
 *
 * It is also invisible from either side. `curriculum-consistency.test.ts`
 * compares lesson questions with each other and never reads the placement pool;
 * `placement-validity.test.ts` compares placement questions with each other and
 * never reads the banks. A question could sit in both sets forever with all of
 * both suites green -- and did: 25 of English's 60, including every one of the ten
 * listening questions, whose sentences were taken straight out of the listening
 * packs when they were authored.
 *
 * Fixes belong on the PLACEMENT side. Placement ids are not review-item keys
 * (those are `lessonId:questionId`), so rewriting a placement question changes
 * nothing a learner has scheduled, while editing a pack line changes the content
 * behind an id real users have saved review state against.
 */

/** The text carrying a question's content, matching curriculum-consistency's rule. */
function lessonContent(question: Question): string {
  if (question.type === "listening") return question.audioText;
  // A speaking question's content is the phrase to say; its prompt is boilerplate.
  if (question.type === "speak") return question.answer;
  return question.prompt;
}

function placementContent(question: PlacementQuestion): string {
  if (question.type === "listening") return question.audioText;
  return question.prompt;
}

/**
 * Compared on content text, not on the answer, and deliberately so: the leak is
 * having SEEN the item. A learner who met "The bridge is ___ inspected annually."
 * in a lesson is advantaged on it in the exam whether or not the two versions
 * agree on the answer or offer the same distractors.
 */
const norm = (text: string) =>
  text
    .trim()
    .replace(/\s*___\s*$/, "")
    .toLowerCase();

const courses = [
  { name: "en", units: curriculum, pool: PLACEMENT_QUESTIONS },
  { name: "fr", units: curriculumFr, pool: PLACEMENT_QUESTIONS_FR },
  { name: "es", units: curriculumEs, pool: PLACEMENT_QUESTIONS_ES },
] as const;

describe.each(courses)(
  "placement pool is disjoint from lesson content ($name)",
  ({ name, units, pool }) => {
    it("asks nothing the course also teaches", () => {
      const lessonsByContent = new Map<string, string[]>();
      for (const unit of units as readonly Unit[]) {
        for (const lesson of unit.lessons) {
          for (const question of lesson.questions) {
            const key = norm(lessonContent(question));
            if (!lessonsByContent.has(key)) lessonsByContent.set(key, []);
            lessonsByContent.get(key)!.push(`${lesson.id}:${question.id}`);
          }
        }
      }

      const overlaps: string[] = [];
      for (const placementQuestion of pool) {
        const where = lessonsByContent.get(norm(placementContent(placementQuestion)));
        if (!where) continue;
        overlaps.push(
          `${placementQuestion.id} [${placementQuestion.level}/${placementQuestion.type}] ` +
            `"${placementContent(placementQuestion)}" also taught at ${where.join(", ")}`,
        );
      }

      // Gated at zero for every course, with no per-course allowance. A ratchet
      // would be the wrong shape here: unlike the lesson-to-lesson duplicate count,
      // which is large and being worked down pack by pack, this set is small, fully
      // fixed, and every entry is a scoring error rather than a repetition someone
      // might tolerate. The message carries the findings because vitest intercepts
      // console output -- a check that reports without failing reads as zero.
      expect(
        overlaps.length,
        `${name}: ${overlaps.length} placement questions are also lesson questions. ` +
          `Rewrite the PLACEMENT side -- its ids are not review keys, lesson ids are:\n` +
          overlaps.join("\n"),
      ).toBe(0);
    });
  },
);
