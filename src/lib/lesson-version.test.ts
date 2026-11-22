import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isExtraQuestionId, resolveLessonSubmission } from "./lesson-version";

describe("the extra-id convention", () => {
  it("matches exactly the ids the lesson-mix pass appends", () => {
    // The ids src/lib/lesson-mix/extras.ts EXTRA_IDS gives listening, speak and translate.
    for (const id of ["lx1", "sx1", "tx1"]) expect(isExtraQuestionId(id)).toBe(true);
    for (const id of ["lx2", "lx10", "xlx1", "LX1", "q1", "u1l1", ""])
      expect(isExtraQuestionId(id)).toBe(false);
  });
});

describe("resolveLessonSubmission", () => {
  const lesson = { questions: [{ id: "q1" }, { id: "q2" }, { id: "lx1" }] };
  const a = (...ids: string[]) => ids.map((questionId) => ({ questionId }));
  it("accepts the base and the full version, paid on the accepted count", () => {
    expect(resolveLessonSubmission(lesson, 2, a("q1", "q2"))).toMatchObject({ ok: true, total: 2 });
    expect(resolveLessonSubmission(lesson, 3, a("q1", "q2", "lx1"))).toMatchObject({
      ok: true,
      total: 3,
    });
  });
  it("drops an extra the server lesson lacks, rejects a missing real question", () => {
    expect(resolveLessonSubmission({ questions: [{ id: "q1" }] }, 2, a("q1", "tx1"))).toEqual({
      ok: true,
      answers: a("q1"),
      total: 1,
    });
    expect(resolveLessonSubmission(lesson, 2, a("q1", "lx1")).ok).toBe(false);
  });
});

describe("the Edge Function copy", () => {
  it("is byte-identical to the web source", () => {
    const web = fs.readFileSync(path.resolve(import.meta.dirname, "lesson-version.ts"), "utf8");
    const edge = fs.readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../supabase/functions/complete-lesson/lesson-version.ts",
      ),
      "utf8",
    );
    expect(edge).toBe(web);
  });
});
