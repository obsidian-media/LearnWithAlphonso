import { describe, expect, it } from "vitest";
import {
  clampSegment,
  groupByLevel,
  nextSegment,
  storyStatus,
  visibleStories,
  type StorySummary,
} from "./stories";

const s = (over: Partial<StorySummary>): StorySummary => ({
  id: "id",
  course: "en",
  level: "A1",
  slug: "x",
  title: "Title",
  sortOrder: 0,
  published: true,
  branching: false,
  segmentIndex: 0,
  segmentCount: 5,
  bestCorrect: null,
  checkTotal: null,
  completed: false,
  ...over,
});

describe("visibleStories", () => {
  it("lists only published stories in the learner's course", () => {
    const list = [
      s({ id: "1", title: "Live" }),
      s({ id: "2", title: "Draft", published: false }),
      s({ id: "3", title: "French", course: "fr" }),
    ];
    expect(visibleStories(list, "en").map((x) => x.id)).toEqual(["1"]);
  });

  it("orders by level, then sort order, then title", () => {
    const list = [
      s({ id: "a2", level: "A2", title: "B" }),
      s({ id: "a1b", level: "A1", sortOrder: 2, title: "B" }),
      s({ id: "a1a", level: "A1", sortOrder: 1, title: "A" }),
    ];
    expect(visibleStories(list, "en").map((x) => x.id)).toEqual(["a1a", "a1b", "a2"]);
  });
});

describe("groupByLevel", () => {
  it("groups by level in level order", () => {
    const groups = groupByLevel([
      s({ id: "1", level: "A2" }),
      s({ id: "2", level: "A1" }),
      s({ id: "3", level: "A2" }),
    ]);
    expect(groups.map((g) => [g.level, g.stories.map((x) => x.id)])).toEqual([
      ["A1", ["2"]],
      ["A2", ["1", "3"]],
    ]);
  });
});

describe("storyStatus", () => {
  it("says New, Continue reading, or the best score", () => {
    expect(storyStatus(s({}))).toBe("New");
    expect(storyStatus(s({ segmentIndex: 3 }))).toBe("Continue reading");
    expect(storyStatus(s({ bestCorrect: 2, checkTotal: 3, completed: true }))).toBe("Best: 2 of 3");
  });
  it("labels a branching story by its path state, not a score", () => {
    expect(storyStatus(s({ branching: true }))).toBe("Choose your path");
    expect(storyStatus(s({ branching: true, completed: true }))).toBe(
      "Ending found — try another path",
    );
  });
});

describe("nextSegment / clampSegment", () => {
  it("advances until the last segment, then ends", () => {
    expect(nextSegment(0, 3)).toBe(1);
    expect(nextSegment(1, 3)).toBe(2);
    expect(nextSegment(2, 3)).toBeNull();
  });
  it("treats stale or bad indexes as the end", () => {
    expect(nextSegment(9, 3)).toBeNull();
    expect(nextSegment(-1, 3)).toBeNull();
    expect(nextSegment(Number.NaN, 3)).toBeNull();
  });
  it("clamps a saved position into the text", () => {
    expect(clampSegment(2, 5)).toBe(2);
    expect(clampSegment(99, 5)).toBe(4);
    expect(clampSegment(-3, 5)).toBe(0);
    expect(clampSegment(2, 0)).toBe(0);
  });
});
