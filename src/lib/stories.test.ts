import { describe, expect, it } from "vitest";
import {
  cardLabel,
  clampSegment,
  endingsFraction,
  endingsLine,
  heroLine,
  resumeLine,
  storiesLibrary,
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
  coverUrl: null,
  endingsTotal: 0,
  endingsFound: 0,
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

describe("storiesLibrary", () => {
  const b = (id: string, sortOrder: number, over: Partial<StorySummary> = {}) =>
    s({ id, sortOrder, branching: true, segmentCount: 0, endingsTotal: 4, ...over });

  it("features the newest branching story and leaves it out of the grid", () => {
    const lib = storiesLibrary(
      [
        b("old", 1),
        b("new", 9),
        s({ id: "lin", sortOrder: 20 }),
        b("draft", 99, { published: false }),
      ],
      "en",
    );
    expect(lib.featured?.id).toBe("new");
    expect(lib.grid.map((x) => x.id).sort()).toEqual(["lin", "old"]);
  });
  it("has no featured story without a branching one", () => {
    expect(storiesLibrary([s({ id: "lin" })], "en").featured).toBeNull();
  });
  it("offers a started, unfinished linear story to resume, never a finished or unopened one", () => {
    expect(storiesLibrary([s({ id: "a", segmentIndex: 2 })], "en").resume?.id).toBe("a");
    expect(
      storiesLibrary([s({ id: "a", segmentIndex: 2, completed: true })], "en").resume,
    ).toBeNull();
    expect(storiesLibrary([s({ id: "a" })], "en").resume).toBeNull();
    expect(storiesLibrary([b("a", 1, { segmentIndex: 3 })], "en").resume).toBeNull();
  });
});

describe("library labels", () => {
  const br = s({
    title: "The Key",
    level: "A2",
    branching: true,
    endingsTotal: 4,
    endingsFound: 1,
  });
  it("says endings found, never more than the total", () => {
    expect(endingsLine(br)).toBe("1 of 4 endings");
    expect(endingsLine({ endingsTotal: 2, endingsFound: 5 })).toBe("2 of 2 endings");
    expect(endingsFraction({ endingsTotal: 4, endingsFound: 1 })).toBe(0.25);
    expect(endingsFraction({ endingsTotal: 0, endingsFound: 0 })).toBe(0);
  });
  it("writes the hero line and the one full card label", () => {
    expect(heroLine(br)).toBe("A2 · 4 endings · 1 found");
    expect(cardLabel(br)).toBe("The Key, A2, Choose your path, 1 of 4 endings");
    expect(cardLabel(s({ title: "Tea", level: "A1" }))).toBe("Tea, A1, New");
  });
  it("counts the resume scene from 1", () => {
    expect(resumeLine(s({ segmentIndex: 2 }))).toBe("Continue · Scene 3");
  });
});
