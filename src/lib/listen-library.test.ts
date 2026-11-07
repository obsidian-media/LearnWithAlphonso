import { describe, expect, it } from "vitest";
import {
  buildShelves,
  clock,
  continueListening,
  episodeFraction,
  episodeState,
  folderLevel,
  hoursMinutes,
  roomForFolder,
  secondsLeft,
  shelfLevels,
  type LibraryEpisode,
  type ListenProgressRow,
} from "./listen-library";
import type { PodcastFolder } from "./podcast-tree";

const f = (
  id: string,
  parentId: string | null,
  slug: string,
  course: PodcastFolder["course"] = null,
  sortOrder = 0,
): PodcastFolder => ({
  id,
  parentId,
  slug,
  title: slug,
  description: null,
  sortOrder,
  course,
});
const folders = [
  f("en", null, "en", "en"),
  f("a2", "en", "a2"),
  f("shop", "a2", "bookshop"),
  f("fr", null, "fr", "fr"),
  f("frq", "fr", "mystery"),
];
const ep = (id: string, folderId: string, n: number, dur = 600): LibraryEpisode => ({
  id,
  folderId,
  title: `Ep ${n}`,
  durationSeconds: dur,
  sortOrder: n,
  course: null,
});
const eps = [ep("e1", "shop", 1), ep("e2", "shop", 2), ep("e3", "shop", 3), ep("f1", "frq", 1)];
const p = (
  episodeId: string,
  positionS: number,
  updatedAt: string,
  completedAt: string | null = null,
): ListenProgressRow => ({
  episodeId,
  positionS,
  updatedAt,
  completedAt,
});

describe("episode state", () => {
  it("is new with no row or a zero position, in progress part-way, done once completed", () => {
    expect(episodeState(undefined)).toBe("new");
    expect(episodeState(p("e1", 0, "t"))).toBe("new");
    expect(episodeState(p("e1", 5, "t"))).toBe("inProgress");
    expect(episodeState(p("e1", 5, "t", "t"))).toBe("done");
  });
  it("fraction is clamped and a completed episode is whole whatever the position", () => {
    expect(episodeFraction(eps[0]!, p("e1", 300, "t"))).toBe(0.5);
    expect(episodeFraction(eps[0]!, p("e1", 9999, "t"))).toBe(1);
    expect(episodeFraction(eps[0]!, p("e1", 10, "t", "t"))).toBe(1);
  });
  it("time left counts from the position", () => {
    expect(secondsLeft(eps[0]!, p("e1", 230, "t"))).toBe(370);
    expect(clock(370)).toBe("6:10");
    expect(hoursMinutes(12000)).toBe("3 h 20 m");
    expect(hoursMinutes(0)).toBe("0 m");
  });
});

describe("shelves", () => {
  it("level comes from the path, and only levels that exist are offered", () => {
    expect(folderLevel(folders, "shop")).toBe("A2");
    expect(folderLevel(folders, "frq")).toBeNull();
    const shelves = buildShelves(folders, eps, [], "en");
    expect(shelfLevels(shelves)).toEqual(["A2"]);
  });
  it("filters by course and counts only folders that hold episodes", () => {
    expect(buildShelves(folders, eps, [], "en").map((s) => s.folder.id)).toEqual(["shop"]);
    expect(buildShelves(folders, eps, [], "fr").map((s) => s.folder.id)).toEqual(["frq"]);
    expect(buildShelves(folders, eps, [], "es")).toEqual([]);
  });
  it("percent averages the episodes; done means exactly 100", () => {
    const [s] = buildShelves(folders, eps, [p("e1", 0, "t", "t"), p("e2", 300, "t")], "en");
    expect(s!.doneCount).toBe(1);
    expect(s!.percent).toBe(50);
    const [all] = buildShelves(
      folders,
      eps,
      [p("e1", 0, "t", "t"), p("e2", 0, "t", "t"), p("e3", 0, "t", "t")],
      "en",
    );
    expect(all!.percent).toBe(100);
  });
  it("a room is chosen by subject, else stably", () => {
    expect(roomForFolder({ slug: "bookshop", title: "Bookshop" })).toBe("library");
    const a = roomForFolder({ slug: "zzz", title: "zzz" });
    expect(roomForFolder({ slug: "zzz", title: "zzz" })).toBe(a);
  });
});

describe("continue listening", () => {
  const shelves = buildShelves(folders, eps, [], "en");
  it("is null before any listening", () => {
    expect(continueListening(shelves, [])).toBeNull();
  });
  it("offers the most recently touched part-way episode", () => {
    const t = continueListening(shelves, [p("e1", 100, "2026-01-01"), p("e2", 50, "2026-01-02")]);
    expect(t?.episode.id).toBe("e2");
  });
  it("after finishing, offers the next unheard episode of that shelf", () => {
    const t = continueListening(shelves, [p("e1", 0, "2026-01-02", "x")]);
    expect(t?.episode.id).toBe("e2");
    expect(t?.progress).toBeUndefined();
  });
  it("is null when everything is finished", () => {
    const all = ["e1", "e2", "e3"].map((id) => p(id, 0, "2026-01-01", "x"));
    expect(continueListening(shelves, all)).toBeNull();
  });
});
