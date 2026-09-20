import { describe, expect, it } from "vitest";
import { QUESTS, QUESTS_BY_ID, currentWeekStart } from "./quests";

describe("QUESTS", () => {
  it("has no duplicate ids", () => {
    const ids = QUESTS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every quest has a positive target and xp reward", () => {
    for (const q of QUESTS) {
      expect(q.target).toBeGreaterThan(0);
      expect(q.xpReward).toBeGreaterThan(0);
      expect(["xp_earned", "lessons_completed"]).toContain(q.metric);
    }
  });
});

describe("QUESTS_BY_ID", () => {
  it("indexes every quest by its id", () => {
    for (const q of QUESTS) {
      expect(QUESTS_BY_ID[q.id]).toBe(q);
    }
  });
});

describe("currentWeekStart", () => {
  it("returns the same Monday for every day within that week", () => {
    // 2026-09-14 is a Monday.
    const monday = currentWeekStart(new Date("2026-09-14T00:00:00Z"));
    const midWeek = currentWeekStart(new Date("2026-09-17T23:59:59Z"));
    const sunday = currentWeekStart(new Date("2026-09-20T12:00:00Z"));
    expect(monday).toBe("2026-09-14");
    expect(midWeek).toBe("2026-09-14");
    expect(sunday).toBe("2026-09-14");
  });

  it("rolls over to the next Monday exactly at the week boundary", () => {
    const nextMonday = currentWeekStart(new Date("2026-09-21T00:00:00Z"));
    expect(nextMonday).toBe("2026-09-21");
  });
});
