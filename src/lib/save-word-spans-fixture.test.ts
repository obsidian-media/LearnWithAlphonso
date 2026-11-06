import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { curriculumEs } from "../data/curriculum-es";
import { curriculumFr } from "../data/curriculum-fr";
import { courseLanguageSpans, splitExplanation } from "./course-language-spans";
import { SAVE_WORD_SPANS_FIXTURE_JSON, type SaveWordSpansFixture } from "./save-word-spans-fixture";

const webFile = path.resolve(import.meta.dirname, "save-word-spans.fixtures.json");
const iosFile = path.resolve(
  import.meta.dirname,
  "../../ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/Fixtures/save-word-spans.fixtures.json",
);
const androidFile = path.resolve(
  import.meta.dirname,
  "../../android/LearnWithAlphonso/core/src/test/resources/save-word-spans.fixtures.json",
);
const STALE = "Run `bun scripts/export-save-word-fixtures.ts` and commit the result.";

describe("shared save-word spans fixture", () => {
  it("is up to date with the implementation and the curriculum", () => {
    expect(fs.readFileSync(webFile, "utf8"), STALE).toBe(SAVE_WORD_SPANS_FIXTURE_JSON());
  });

  it("the iOS copy is byte-for-byte the web file", () => {
    expect(fs.readFileSync(iosFile, "utf8"), STALE).toBe(fs.readFileSync(webFile, "utf8"));
  });

  it("the Android copy is byte-for-byte the web file", () => {
    expect(fs.readFileSync(androidFile, "utf8"), STALE).toBe(fs.readFileSync(webFile, "utf8"));
  });

  const fixture = JSON.parse(fs.readFileSync(webFile, "utf8")) as SaveWordSpansFixture;
  for (const [name, curriculum] of [
    ["fr", curriculumFr],
    ["es", curriculumEs],
  ] as const) {
    it(`${name}: every question's spans and positions match the fixture exactly`, () => {
      const seen = new Set<string>();
      for (const unit of curriculum)
        for (const lesson of unit.lessons)
          for (const q of lesson.questions) {
            const key = `${lesson.id}:${q.id}`;
            const spans = courseLanguageSpans(q);
            const expected = fixture[name][key];
            expect(spans, key).toEqual(expected?.spans ?? []);
            if (expected) {
              seen.add(key);
              expect(
                splitExplanation(q.explanation, spans).map((p) => [p.text, p.course ? 1 : 0]),
                key,
              ).toEqual(expected.pieces);
            }
          }
      expect(seen.size).toBe(Object.keys(fixture[name]).length);
    });

    it(`${name}: text before an arrow is never tappable`, () => {
      for (const [key, entry] of Object.entries(fixture[name]))
        for (const [text, course] of entry.pieces)
          if (course === 1) expect(text, key).not.toContain("→");
      // And the plain piece that precedes a course piece after an arrow is the English side.
      const arrowPlain = Object.values(fixture[name]).filter((e) =>
        e.pieces.some(([t, c], i) => c === 0 && t.endsWith("→ ") && e.pieces[i + 1]?.[1] === 1),
      );
      // A floor so the check above runs on real cases. Measured after the 2026-11-06 content review,
      // which rewrote the generic "English → French" explanations as prose: French 91 (was 1,125),
      // Spanish 127 (was 1,435). Raise it if the count grows; never lower it below the real count.
      expect(arrowPlain.length).toBeGreaterThan(90);
    });
  }
});
