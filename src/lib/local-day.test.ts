import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { localDay, streakBridge } from "./local-day";

const at = (iso: string) => Date.parse(iso);

describe("localDay", () => {
  it("is the learner's calendar day, which can differ from UTC's", () => {
    // 2026-11-12 23:30 UTC is already the 13th in Sydney (UTC+11) and still the 12th in Los Angeles (UTC-8).
    expect(localDay(at("2026-11-12T23:30:00Z"), "UTC")).toBe("2026-11-12");
    expect(localDay(at("2026-11-12T23:30:00Z"), "Australia/Sydney")).toBe("2026-11-13");
    expect(localDay(at("2026-11-12T23:30:00Z"), "America/Los_Angeles")).toBe("2026-11-12");
    // 2026-11-13 02:00 UTC is still the 12th in Los Angeles.
    expect(localDay(at("2026-11-13T02:00:00Z"), "America/Los_Angeles")).toBe("2026-11-12");
  });
  it("follows daylight saving time, not a fixed offset", () => {
    // New York is UTC-4 in summer and UTC-5 in winter: 04:30 UTC is the previous day in winter only after 05:00.
    expect(localDay(at("2026-07-01T04:30:00Z"), "America/New_York")).toBe("2026-07-01");
    expect(localDay(at("2026-01-01T04:30:00Z"), "America/New_York")).toBe("2025-12-31");
  });
  it("falls back to UTC for no zone, an empty zone or one that does not exist", () => {
    for (const z of [null, undefined, "", "Not/AZone", "  "])
      expect(localDay(at("2026-11-12T23:30:00Z"), z)).toBe("2026-11-12");
  });
  it("handles the far zones either side of the date line", () => {
    expect(localDay(at("2026-11-12T12:00:00Z"), "Pacific/Kiritimati")).toBe("2026-11-13"); // UTC+14
    expect(localDay(at("2026-11-12T08:00:00Z"), "Pacific/Pago_Pago")).toBe("2026-11-11"); // UTC-11
  });
});

describe("streakBridge: the one-time transition from UTC days to local days", () => {
  // A streak written under the old UTC rule stores a UTC date. East of UTC the learner's local "yesterday" can be
  // two UTC dates back, which must still count as yesterday once, so nobody's streak drops on the switch.
  it("applies only to a streak still on the UTC basis", () => {
    expect(streakBridge("utc")).toBe(true);
    expect(streakBridge("local")).toBe(false);
    expect(streakBridge(null)).toBe(true);
    expect(streakBridge(undefined)).toBe(true);
  });
});

describe("the Deno copy", () => {
  it("is the same file as the web one, apart from its header", () => {
    const strip = (s: string) => s.replace(/^\/\/ [^\n]*\n/gm, "").trim();
    const web = readFileSync(new URL("./local-day.ts", import.meta.url), "utf8");
    const deno = readFileSync(
      new URL("../../supabase/functions/_shared/local-day.ts", import.meta.url),
      "utf8",
    );
    expect(strip(deno)).toBe(strip(web));
  });
});
