import { describe, expect, it } from "vitest";
import { LESSON_EXTRAS } from "../data/lesson-extras";
import { getCourse, type Course } from "../data/courses";
import { isExtraQuestionId, resolveLessonSubmission } from "./lesson-version";

// lesson-version.test.ts and sync.functions.test.ts use hand-made lessons (the sync fixtures even load the
// curriculum WITHOUT extras). This file runs the submission rule against the REAL curriculum with the REAL
// appended lx1/sx1/tx1 of src/data/lesson-extras, so a change to either side cannot slip past both.
const COURSES: Course[] = ["en", "fr", "es"];

describe("resolveLessonSubmission against the real appended extras", () => {
  for (const course of COURSES) {
    const lessons = getCourse(course).curriculum.flatMap((u) => u.lessons);
    const withExtras = lessons.filter((l) => l.questions.some((q) => isExtraQuestionId(q.id)));

    it(`${course}: the extras in the data are the ones in the built lessons (${withExtras.length} lessons)`, () => {
      expect(withExtras.length).toBe(Object.keys(LESSON_EXTRAS[course]).length);
    });

    it(`${course}: every lesson with extras accepts the full set and the base set, and nothing in between`, () => {
      for (const lesson of withExtras) {
        const all = lesson.questions.map((q) => ({ questionId: q.id }));
        const base = all.filter((a) => !isExtraQuestionId(a.questionId));
        const extras = all.filter((a) => isExtraQuestionId(a.questionId));
        expect(resolveLessonSubmission(lesson, all.length, all), lesson.id).toMatchObject({
          ok: true,
          total: all.length,
        });
        expect(resolveLessonSubmission(lesson, base.length, base), lesson.id).toMatchObject({
          ok: true,
          total: base.length,
        });
        if (extras.length > 1) {
          // A partial set of the server's extras is rejected.
          const partial = [...base, extras[0]!];
          expect(resolveLessonSubmission(lesson, partial.length, partial).ok, lesson.id).toBe(
            false,
          );
        }
        // A missing real question is rejected even with every extra present.
        const missing = [...base.slice(1), ...extras];
        expect(resolveLessonSubmission(lesson, missing.length, missing).ok, lesson.id).toBe(false);
      }
    });
  }

  it("a build older than the database re-seed, sending extras the server lacks, is paid on the real lesson only", () => {
    const real = getCourse("en").findLesson("u1l1")!.lesson;
    const base = real.questions.filter((q) => !isExtraQuestionId(q.id));
    const serverBase = { questions: base.map((q) => ({ id: q.id })) };
    const sent = [...base, { id: "lx1" }, { id: "sx1" }, { id: "tx1" }].map((q) => ({
      questionId: q.id,
    }));
    expect(resolveLessonSubmission(serverBase, sent.length, sent)).toMatchObject({
      ok: true,
      total: base.length,
    });
  });
});
