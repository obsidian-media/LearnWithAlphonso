import { describe, expect, it } from "vitest";
import fixtures from "./team-mission.fixtures.json";
import { parseTeamMission, type TeamMissionRow } from "./team-mission";

describe("parseTeamMission contract fixtures", () => {
  for (const c of fixtures.cases) {
    it(c.name, () => {
      const now = Date.parse((c as { now?: string }).now ?? fixtures.now);
      expect(parseTeamMission(c.row as TeamMissionRow, now)).toEqual(c.expected);
    });
  }
});

describe("parseTeamMission edges", () => {
  const base = fixtures.cases[0].row as TeamMissionRow;
  const now = Date.parse(fixtures.now);

  it("returns null when the caller has no team (no row)", () => {
    expect(parseTeamMission(undefined, now)).toBeNull();
  });

  it("never reports a negative number of days left", () => {
    expect(parseTeamMission({ ...base, week_end: "2026-10-01" }, now)?.daysLeft).toBe(0);
  });

  it("an unknown status from a newer server falls back to in_progress, never crashes", () => {
    expect(parseTeamMission({ ...base, status: "weird" as never }, now)?.status).toBe(
      "in_progress",
    );
  });

  it("a zero target never divides by zero", () => {
    expect(parseTeamMission({ ...base, target: 0, status: "in_progress" }, now)?.percent).toBe(0);
  });

  it("percent rounds down so 99.9 percent never reads as done", () => {
    expect(parseTeamMission({ ...base, total: 799, target: 800 }, now)?.percent).toBe(99);
  });
});
