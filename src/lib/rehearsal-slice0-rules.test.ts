import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  REHEARSAL_DATED_CLOSE_DAYS,
  REHEARSAL_UNDATED_CLOSE_DAYS,
  decideRunStart,
  rehearsalTimedOut,
  runNeedsPro,
} from "./rehearsal-rules";

describe("runNeedsPro: no Pro-only run exists yet", () => {
  it("is false for every run today, and true for the two Pro-only shapes that are coming", () => {
    expect(runNeedsPro({})).toBe(false);
    expect(runNeedsPro({ persona: "alphonso" })).toBe(false);
    expect(runNeedsPro({ persona: "alphonso", hard: false })).toBe(false);
    expect(runNeedsPro({ persona: "hector" })).toBe(true);
    expect(runNeedsPro({ hard: true })).toBe(true);
  });
});

describe("decideRunStart: Pro is checked once, at the start of a Pro-only run", () => {
  it.each([
    [false, "pro", "ok"],
    [false, "free", "ok"],
    [false, "unavailable", "ok"],
    [true, "pro", "ok"],
    [true, "free", "paywall"],
    [true, "unavailable", "retry"],
  ] as const)("needs Pro %s, %s -> %s", (needs, pro, expected) => {
    expect(decideRunStart(needs, pro)).toBe(expected);
  });

  it("never says ok for a Pro run while the Pro state is unavailable", () => {
    expect(decideRunStart(true, "unavailable")).not.toBe("ok");
  });
});

describe("rehearsalTimedOut: the TypeScript twin of close_stale_rehearsals", () => {
  const NOW = Date.parse("2026-12-10T12:00:00Z");
  const created = "2026-11-01T10:00:00Z";

  it("a dated rehearsal ends 7 days after its event date, by the learner's day", () => {
    const r = { eventDate: "2026-12-01", createdAt: created };
    expect(rehearsalTimedOut(r, null, NOW, "2026-12-07")).toBe(false);
    expect(rehearsalTimedOut(r, null, NOW, "2026-12-08")).toBe(true);
  });

  it("a dated rehearsal's runs do not keep it open", () => {
    const r = { eventDate: "2026-12-01", createdAt: created };
    expect(rehearsalTimedOut(r, "2026-12-09T00:00:00Z", NOW, "2026-12-09")).toBe(true);
  });

  it("an undated rehearsal ends 30 days after the later of its creation and its newest finished run", () => {
    const r = { eventDate: null, createdAt: "2026-11-11T12:00:00Z" };
    expect(rehearsalTimedOut(r, null, NOW, "2026-12-10")).toBe(false); // 29 days
    expect(rehearsalTimedOut(r, null, Date.parse("2026-12-11T12:00:00Z"), "2026-12-11")).toBe(true);
    // A finished run 5 days ago keeps it alive.
    expect(
      rehearsalTimedOut(
        { eventDate: null, createdAt: "2026-09-01T00:00:00Z" },
        "2026-12-05T00:00:00Z",
        NOW,
        "2026-12-10",
      ),
    ).toBe(false);
  });

  it("carries the same numbers as the database function", () => {
    const sql = readFileSync(
      path.join(
        process.cwd(),
        "supabase/migrations/20261130100000_rehearsals_switch_and_auto_close.sql",
      ),
      "utf8",
    );
    expect(sql).toContain(`r.event_date + ${REHEARSAL_DATED_CLOSE_DAYS} <= _today`);
    expect(sql).toContain(`now() - interval '${REHEARSAL_UNDATED_CLOSE_DAYS} days'`);
  });
});
