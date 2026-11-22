import { assertEquals } from "jsr:@std/assert@1";
import { resolveLessonSubmission } from "./lesson-version.ts";

const lesson = { questions: [{ id: "q1" }, { id: "q2" }, { id: "q3" }] };
// The same lesson after the lesson-mix pass appended a listening and a translate question.
const reseeded = { questions: [...lesson.questions, { id: "lx1" }, { id: "tx1" }] };
const answers = (...ids: string[]) => ids.map((questionId) => ({ questionId }));
const ids = (r: ReturnType<typeof resolveLessonSubmission<{ questionId: string }>>) =>
  r.ok ? r.answers.map((a) => a.questionId) : null;

Deno.test("matches when total and the answered id set equal the server lesson", () => {
  const r = resolveLessonSubmission(lesson, 3, answers("q1", "q2", "q3"));
  assertEquals(r.ok, true);
  assertEquals(r.ok && r.total, 3);
});
Deno.test("a missing server lesson is a mismatch", () => {
  assertEquals(resolveLessonSubmission(null, 3, answers("q1", "q2", "q3")).ok, false);
});
Deno.test("a different question count is a mismatch", () => {
  assertEquals(resolveLessonSubmission(lesson, 2, answers("q1", "q2")).ok, false);
});
Deno.test("a foreign or duplicate question id is a mismatch", () => {
  assertEquals(resolveLessonSubmission(lesson, 3, answers("q1", "q2", "q9")).ok, false);
  assertEquals(resolveLessonSubmission(lesson, 3, answers("q1", "q1", "q3")).ok, false);
});
Deno.test(
  "a total that disagrees with the answers sent is a mismatch even when every id is valid",
  () => {
    assertEquals(resolveLessonSubmission(lesson, 5, answers("q1", "q2", "q3")).ok, false);
    assertEquals(resolveLessonSubmission(lesson, 2, answers("q1", "q2", "q3")).ok, false);
  },
);

Deno.test(
  "old bundle (base) against the reseeded lesson is accepted, paid on the base count",
  () => {
    const r = resolveLessonSubmission(reseeded, 3, answers("q1", "q2", "q3"));
    assertEquals(r.ok && r.total, 3);
    assertEquals(ids(r), ["q1", "q2", "q3"]);
  },
);
Deno.test(
  "new bundle (full) against the reseeded lesson is accepted, paid on the full count",
  () => {
    const r = resolveLessonSubmission(reseeded, 5, answers("q1", "q2", "q3", "lx1", "tx1"));
    assertEquals(r.ok && r.total, 5);
    assertEquals(ids(r), ["q1", "q2", "q3", "lx1", "tx1"]);
  },
);
Deno.test(
  "new bundle against the not-yet-reseeded lesson is accepted and the unknown extras are dropped",
  () => {
    const r = resolveLessonSubmission(lesson, 6, answers("q1", "q2", "q3", "lx1", "sx1", "tx1"));
    assertEquals(r.ok && r.total, 3);
    assertEquals(ids(r), ["q1", "q2", "q3"]);
  },
);
Deno.test(
  "a new bundle whose extras are only partly in the database drops just the unknown one",
  () => {
    const partlySeeded = { questions: [...lesson.questions, { id: "lx1" }, { id: "sx1" }] };
    const r = resolveLessonSubmission(
      partlySeeded,
      6,
      answers("q1", "q2", "q3", "lx1", "sx1", "tx1"),
    );
    assertEquals(ids(r), ["q1", "q2", "q3", "lx1", "sx1"]);
  },
);

Deno.test("a missing real question is a mismatch, extras or not", () => {
  assertEquals(resolveLessonSubmission(reseeded, 4, answers("q1", "q2", "lx1", "tx1")).ok, false);
  assertEquals(resolveLessonSubmission(reseeded, 2, answers("q1", "q2")).ok, false);
  assertEquals(resolveLessonSubmission(lesson, 3, answers("q1", "q2", "lx1")).ok, false);
});
Deno.test("only some of the server's extras answered is neither version", () => {
  assertEquals(resolveLessonSubmission(reseeded, 4, answers("q1", "q2", "q3", "lx1")).ok, false);
});
Deno.test("an unknown id that is not exactly an extra id is a mismatch", () => {
  for (const bad of ["lx2", "lx10", "xlx1", "LX1", "sx", "q9"]) {
    assertEquals(resolveLessonSubmission(lesson, 4, answers("q1", "q2", "q3", bad)).ok, false, bad);
  }
});
Deno.test("a duplicated extra id is a mismatch", () => {
  assertEquals(
    resolveLessonSubmission(reseeded, 6, answers("q1", "q2", "q3", "lx1", "lx1", "tx1")).ok,
    false,
  );
});
Deno.test("an empty submission is a mismatch", () => {
  assertEquals(resolveLessonSubmission({ questions: [] }, 0, []).ok, false);
});
