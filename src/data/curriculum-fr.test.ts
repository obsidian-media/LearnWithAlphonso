import { describe, expect, it } from "vitest";
import {
  allLessonIdsFr,
  curriculumFr,
  findLessonFr,
  lookupQuestionFr,
  questionIndexFr,
  unitsForLevelFr,
} from "./curriculum-fr";

describe("lookupQuestionFr", () => {
  it("resolves every key present in questionIndexFr", () => {
    const key = Object.keys(questionIndexFr)[0];
    expect(lookupQuestionFr(key)).toBe(questionIndexFr[key]);
  });

  it("returns null for an unknown key", () => {
    expect(lookupQuestionFr("nope:nope")).toBeNull();
  });
});

describe("unitsForLevelFr", () => {
  it("only returns units at the requested level", () => {
    for (const unit of unitsForLevelFr("A1")) {
      expect(unit.level).toBe("A1");
    }
  });

  it("returns every unit at that level", () => {
    const expected = curriculumFr.filter((u) => u.level === "A1").length;
    expect(unitsForLevelFr("A1").length).toBe(expected);
  });
});

describe("findLessonFr", () => {
  it("finds a known lesson by id with its owning unit and index", () => {
    const knownId = allLessonIdsFr[0];
    const found = findLessonFr(knownId);
    expect(found?.lesson.id).toBe(knownId);
    expect(found?.unit.lessons[found.index].id).toBe(knownId);
  });

  it("returns null for an unknown lesson id", () => {
    expect(findLessonFr("does-not-exist")).toBeNull();
  });
});
