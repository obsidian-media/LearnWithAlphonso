import { describe, expect, it } from "vitest";
import {
  allLessonIds,
  curriculum,
  findLesson,
  lookupQuestion,
  questionIndex,
  unitsForLevel,
} from "./curriculum";

describe("lookupQuestion", () => {
  it("resolves every key present in questionIndex", () => {
    const key = Object.keys(questionIndex)[0];
    expect(lookupQuestion(key)).toBe(questionIndex[key]);
  });

  it("returns null for an unknown key", () => {
    expect(lookupQuestion("nope:nope")).toBeNull();
  });
});

describe("unitsForLevel", () => {
  it("only returns units at the requested level", () => {
    for (const unit of unitsForLevel("A1")) {
      expect(unit.level).toBe("A1");
    }
  });

  it("returns every unit at that level", () => {
    const expected = curriculum.filter((u) => u.level === "B1").length;
    expect(unitsForLevel("B1").length).toBe(expected);
  });
});

describe("findLesson", () => {
  it("finds a known lesson by id with its owning unit and index", () => {
    const knownId = allLessonIds[0];
    const found = findLesson(knownId);
    expect(found?.lesson.id).toBe(knownId);
    expect(found?.unit.lessons[found.index].id).toBe(knownId);
  });

  it("returns null for an unknown lesson id", () => {
    expect(findLesson("does-not-exist")).toBeNull();
  });
});
