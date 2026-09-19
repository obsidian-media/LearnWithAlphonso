import { describe, expect, it } from "vitest";
import { COURSES, getCourse, isCourse } from "./courses";

describe("isCourse", () => {
  it("accepts every known course id", () => {
    for (const c of COURSES) {
      expect(isCourse(c.id)).toBe(true);
    }
  });

  it("rejects unknown strings", () => {
    expect(isCourse("de")).toBe(false);
    expect(isCourse("")).toBe(false);
  });
});

describe("getCourse", () => {
  it("returns a bundle with a non-empty curriculum for each known course", () => {
    for (const c of COURSES) {
      const bundle = getCourse(c.id);
      expect(bundle.curriculum.length).toBeGreaterThan(0);
      expect(bundle.allLessonIds.length).toBeGreaterThan(0);
      expect(bundle.placementPool.length).toBeGreaterThan(0);
    }
  });

  it("pickPlacement samples from that course's own placement pool", () => {
    for (const c of COURSES) {
      const bundle = getCourse(c.id);
      const set = bundle.pickPlacement();
      for (const q of set) expect(bundle.placementPool).toContain(q);
    }
  });

  it("findLesson resolves a real lesson id and misses an unknown one", () => {
    const bundle = getCourse("en");
    const knownId = bundle.allLessonIds[0];
    expect(bundle.findLesson(knownId)?.lesson.id).toBe(knownId);
    expect(bundle.findLesson("does-not-exist")).toBeNull();
  });
});
