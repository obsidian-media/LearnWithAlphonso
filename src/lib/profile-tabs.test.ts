import { describe, expect, it } from "vitest";
import {
  ALL_SECTIONS, PROFILE_TABS, TAB_SECTIONS, achievementsSummary, heatSummary, stepTab, weakSummary,
} from "./profile-tabs";

describe("profile tab assignment", () => {
  const placed = Object.values(TAB_SECTIONS).flat();
  it("every pre-split section lands on exactly one tab", () => {
    for (const s of ALL_SECTIONS) expect(placed.filter((p) => p === s), s).toHaveLength(1);
    expect(placed).toHaveLength(ALL_SECTIONS.length);
  });
  it("matches the approved mock: overview / progress / social", () => {
    expect(PROFILE_TABS.map((t) => t.id)).toEqual(["overview", "progress", "social"]);
    expect(TAB_SECTIONS.overview.slice(0, 3)).toEqual(["bigNumbers", "thisWeek", "hector"]);
    expect(TAB_SECTIONS.progress[0]).toBe("skills");
    expect(TAB_SECTIONS.social).toEqual(["league", "friends", "share"]);
  });
  it("settings stay reachable (on overview)", () => {
    expect(TAB_SECTIONS.overview).toContain("settings");
  });
});
describe("stepTab", () => {
  it("steps and clamps", () => {
    expect(stepTab("overview", 1)).toBe("progress");
    expect(stepTab("social", 1)).toBe("social");
    expect(stepTab("overview", -1)).toBe("overview");
  });
});
describe("summaries", () => {
  it("come from counts", () => {
    expect(heatSummary(1)).toBe("1 active day");
    expect(heatSummary(71)).toBe("71 active days");
    expect(weakSummary(0)).toBe("Nothing to review");
    expect(weakSummary(3)).toBe("3 to review");
    expect(achievementsSummary(14, 48)).toBe("14 of 48");
  });
});
