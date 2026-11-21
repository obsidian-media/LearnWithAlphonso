import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getCourse, type Course } from "./courses";
import { LESSON_EXTRAS } from "./lesson-extras";
import { EXTRA_TYPES, type LessonExtras } from "../lib/lesson-mix/extras";
import { existingKeys, gateExtra, normKey } from "../lib/lesson-mix/gates";

const COURSES: Course[] = ["en", "fr", "es"];

// The gates hold for every record in the live data AND in the pilot sample (docs/lesson-mix/pilot,
// not loaded by the app). Both are empty or absent until content lands; the test then guards it.
function check(label: string, extras: LessonExtras, course: Course) {
  const index = new Map<string, { level: "A1" | "A2" | "B1" | "B2" | "C1" }>();
  for (const u of getCourse(course).curriculum)
    for (const l of u.lessons) index.set(l.id, { level: u.level });
  // Existing keys exclude the records themselves (live extras are already in the curriculum).
  const live = new Set(Object.keys(LESSON_EXTRAS[course]));
  const base = existingKeys(
    getCourse(course).curriculum.map((u) => ({
      lessons: u.lessons.map((l) => ({
        questions: live.has(l.id)
          ? l.questions.filter((q) => !/^(lx1|sx1|tx1)$/.test(q.id))
          : l.questions,
      })),
    })),
  );
  describe(`${label} ${course}`, () => {
    it(`has ${Object.keys(extras).length} records, all keyed by an existing lesson id`, () => {
      for (const id of Object.keys(extras)) expect(index.has(id), id).toBe(true);
    });
    for (const [lessonId, extra] of Object.entries(extras)) {
      it(`${lessonId} exists and every record passes the gates`, () => {
        const meta = index.get(lessonId);
        expect(meta, `unknown lesson ${lessonId}`).toBeTruthy();
        for (const t of EXTRA_TYPES) {
          if (!extra[t]) continue;
          const r = gateExtra(t, extra, { course, level: meta!.level, existing: base });
          expect(r.problems, `${lessonId} ${t}`).toEqual([]);
          const key =
            t === "listening"
              ? extra.listening!.audioText
              : t === "speak"
                ? extra.speak!.answer
                : extra.translate!.acceptableAnswers[0]!;
          base[t].add(normKey(key));
        }
      });
    }
  });
}

for (const c of COURSES) {
  check("live", LESSON_EXTRAS[c], c);
  const p = path.join(__dirname, "..", "..", "docs", "lesson-mix", "pilot", `${c}.json`);
  if (fs.existsSync(p)) check("pilot", JSON.parse(fs.readFileSync(p, "utf8")) as LessonExtras, c);
}

describe("lesson-extras wiring", () => {
  it("each course builds with its live extras appended after the existing questions", () => {
    for (const c of COURSES)
      for (const [id, extra] of Object.entries(LESSON_EXTRAS[c])) {
        const q = getCourse(c).findLesson(id)!.lesson.questions;
        const n = EXTRA_TYPES.filter((t) => extra[t]).length;
        expect(q.slice(-n).map((x) => x.id)).toEqual(
          ["lx1", "sx1", "tx1"].filter((_, i) => extra[EXTRA_TYPES[i]!]),
        );
      }
  });
});
