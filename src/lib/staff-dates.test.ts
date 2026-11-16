import { describe, expect, it } from "vitest";
import { formatDateTime, formatDay } from "./staff-dates";

describe("console dates", () => {
  it("a day reads as 2 Mar 2026", () => {
    expect(formatDay("2026-03-02T12:00:00Z", "UTC")).toBe("2 Mar 2026");
    expect(formatDay("2026-11-14T00:30:00Z", "UTC")).toBe("14 Nov 2026");
  });
  it("a time reads as 14 Nov 2026, 10:41 on a 24 hour clock", () => {
    expect(formatDateTime("2026-11-14T10:41:00Z", "UTC")).toBe("14 Nov 2026, 10:41");
    expect(formatDateTime("2026-11-14T22:05:00Z", "UTC")).toBe("14 Nov 2026, 22:05");
  });
  it("is the same whatever the zone says the day is", () => {
    expect(formatDay("2026-03-02T23:30:00Z", "Pacific/Auckland")).toBe("3 Mar 2026");
  });
});
