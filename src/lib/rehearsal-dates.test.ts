import { describe, expect, it } from "vitest";
import {
  addDaysTo,
  addMonths,
  daysToGo,
  daysToGoText,
  localToday,
  monthGrid,
  shortDay,
  longDay,
} from "./rehearsal-dates";

describe("rehearsal dates (the learner's own calendar, Monday first)", () => {
  it("localToday is the device's own calendar day, not UTC", () => {
    // 23:30 on the 16th in a zone east of UTC is the 17th in UTC: the local fields decide.
    const local = new Date(2026, 10, 16, 23, 30);
    expect(localToday(local)).toBe("2026-11-16");
  });

  it("counts the days to go", () => {
    expect(daysToGo("2026-12-01", "2026-11-26")).toBe(5);
    expect(daysToGo("2026-11-26", "2026-11-26")).toBe(0);
    expect(daysToGo("2026-11-25", "2026-11-26")).toBe(-1);
    expect(daysToGoText("2026-12-01", "2026-11-26")).toBe("5 days to go");
    expect(daysToGoText("2026-11-27", "2026-11-26")).toBe("1 day to go");
    expect(daysToGoText("2026-11-26", "2026-11-26")).toBe("Today");
    expect(daysToGoText("2026-11-25", "2026-11-26")).toBe("It was yesterday");
    expect(daysToGoText("2026-11-20", "2026-11-26")).toBe("6 days ago");
  });

  it("writes a day short and long, in English whatever the device language", () => {
    expect(shortDay("2026-12-01")).toBe("Tue 1 Dec");
    expect(longDay("2026-12-02")).toBe("Wednesday 2 December");
  });

  it("builds a Monday-first month grid padded with empty cells", () => {
    const g = monthGrid(2026, 11); // December 2026 starts on a Tuesday
    expect(g[0]).toEqual([null, "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06"]);
    expect(g.flat().filter(Boolean)).toHaveLength(31);
    expect(g.every((w) => w.length === 7)).toBe(true);
  });

  it("adds days across a month and a year end", () => {
    expect(addDaysTo("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDaysTo("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("moves between months across a year end", () => {
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });
});
