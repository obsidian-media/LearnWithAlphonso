// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COURSE_KEY_PREFIX, rememberedCourse, useProgress } from "./progress";

// A French or Spanish learner used to be put back on English progress by every reload: the course lived in memory
// only, and the root load asked the server for the default course.
beforeEach(() => {
  localStorage.clear();
  useProgress.getState().reset();
});
afterEach(() => vi.restoreAllMocks());

describe("the active course is remembered per account", () => {
  it("setCourse is remembered for the signed-in account, and a reload (a fresh adopt) gets it back", () => {
    expect(useProgress.getState().adoptUser("u1")).toBe("en");
    useProgress.getState().setCourse("fr");
    expect(localStorage.getItem(COURSE_KEY_PREFIX + "u1")).toBe("fr");

    // The reload: memory is gone, storage is not.
    useProgress.getState().reset();
    expect(useProgress.getState().course).toBe("en");
    expect(useProgress.getState().adoptUser("u1")).toBe("fr");
    expect(useProgress.getState().course).toBe("fr");
  });

  it("another account on the same browser does not inherit it", () => {
    useProgress.getState().adoptUser("u1");
    useProgress.getState().setCourse("es");
    useProgress.getState().reset();
    expect(useProgress.getState().adoptUser("u2")).toBe("en");
    expect(rememberedCourse("u1")).toBe("es");
  });

  it("on a new device the account's profile course is used before English, and this browser's memory wins", () => {
    expect(useProgress.getState().adoptUser("u1", "es")).toBe("es");
    useProgress.getState().reset();
    expect(useProgress.getState().adoptUser("u2", null)).toBe("en");
    useProgress.getState().reset();
    localStorage.setItem(COURSE_KEY_PREFIX + "u3", "fr");
    expect(useProgress.getState().adoptUser("u3", "es")).toBe("fr");
  });

  it("adopting the same account again keeps the course already in memory", () => {
    useProgress.getState().adoptUser("u1");
    useProgress.getState().setCourse("fr");
    localStorage.clear();
    expect(useProgress.getState().adoptUser("u1")).toBe("fr");
  });

  it("ignores a stored value that is not a course", () => {
    localStorage.setItem(COURSE_KEY_PREFIX + "u1", "de");
    expect(useProgress.getState().adoptUser("u1")).toBe("en");
  });

  it("works without storage: the course holds in memory and nothing throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(useProgress.getState().adoptUser("u1")).toBe("en");
    expect(() => useProgress.getState().setCourse("fr")).not.toThrow();
    expect(useProgress.getState().course).toBe("fr");
  });

  it("hydrate records which course the numbers are for", () => {
    useProgress.getState().adoptUser("u1");
    useProgress.getState().hydrate({ xp: 5 });
    expect(useProgress.getState().hydratedCourse).toBe("en");
    useProgress.getState().setCourse("fr");
    expect(useProgress.getState().hydratedCourse).toBe("en");
    useProgress.getState().hydrate({ xp: 9 });
    expect(useProgress.getState().hydratedCourse).toBe("fr");
  });
});
