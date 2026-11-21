import { describe, expect, it } from "vitest";
import {
  buildUptime,
  deriveBanner,
  jobsState,
  UPTIME_DAYS,
  type ServiceRow,
  type ServiceState,
  type SweepRaw,
} from "./health-core";

const NOW = new Date("2026-11-21T12:00:00Z");
const row = (key: ServiceRow["key"], state: ServiceState): ServiceRow => ({
  key,
  name: key,
  detail: null,
  state,
  reason: null,
  latencyMs: null,
  uptime: null,
  uptimeError: false,
  jobs: null,
});

describe("buildUptime: a day with no checks is grey, never green", () => {
  it("with no rows at all every bar is no data, there is no percentage and no first check", () => {
    const u = buildUptime([], null, NOW);
    expect(u.bars).toHaveLength(UPTIME_DAYS);
    expect(u.bars.every((b) => b.state === "nodata")).toBe(true);
    expect(u.percent).toBeNull();
    expect(u.daysWithData).toBe(0);
    expect(u.firstAt).toBeNull();
  });

  it("only the days with rows get a colour; the other days stay no data; today is the last bar", () => {
    const u = buildUptime(
      [
        { service: "database", day: "2026-11-21", checks: 4, okChecks: 4 },
        { service: "database", day: "2026-11-20", checks: 4, okChecks: 2 },
        { service: "database", day: "2026-11-19", checks: 2, okChecks: 0 },
      ],
      "2026-11-19T01:00:00Z",
      NOW,
    );
    const states = u.bars.slice(-4).map((b) => [b.day, b.state]);
    expect(states).toEqual([
      ["2026-11-18", "nodata"],
      ["2026-11-19", "down"],
      ["2026-11-20", "partial"],
      ["2026-11-21", "up"],
    ]);
    expect(u.bars.filter((b) => b.state !== "nodata")).toHaveLength(3);
    expect(u.daysWithData).toBe(3);
  });

  it("the percentage covers only days that have data (6 of 10 checks), not the 90 day window", () => {
    const u = buildUptime(
      [
        { service: "auth", day: "2026-11-21", checks: 4, okChecks: 4 },
        { service: "auth", day: "2026-11-20", checks: 6, okChecks: 2 },
      ],
      "2026-11-20T00:00:00Z",
      NOW,
    );
    expect(u.percent).toBe(60);
  });

  it("a row with zero checks is no data, and rows outside the window are ignored", () => {
    const u = buildUptime(
      [
        { service: "auth", day: "2026-11-21", checks: 0, okChecks: 0 },
        { service: "auth", day: "2025-01-01", checks: 9, okChecks: 9 },
      ],
      null,
      NOW,
    );
    expect(u.bars.every((b) => b.state === "nodata")).toBe(true);
    expect(u.percent).toBeNull();
  });
});

describe("deriveBanner never says everything is fine while a row is unknown", () => {
  it("is ok only when every row is healthy or configured", () => {
    expect(deriveBanner([row("database", "healthy"), row("ai", "configured")])).toEqual({
      kind: "ok",
      configuredOnly: 1,
    });
  });

  it.each<ServiceState>(["unknown", "not_connected"])("%s makes it unchecked, not ok", (s) => {
    const b = deriveBanner([row("database", "healthy"), row("payments", s)]);
    expect(b.kind).toBe("unchecked");
  });

  it("a degraded row wins over an unknown one and both are counted", () => {
    expect(
      deriveBanner([row("database", "degraded"), row("ai", "unknown"), row("jobs", "healthy")]),
    ).toEqual({ kind: "degraded", degraded: 1, unchecked: 1 });
  });
});

describe("jobsState from the job log", () => {
  const sweep = (over: Partial<SweepRaw> = {}): SweepRaw => ({
    scheduled: true,
    lastRunAt: "2026-11-21T11:50:00Z",
    lastStatus: "succeeded",
    runs24h: 96,
    failed24h: 0,
    ...over,
  });
  it("is unknown when the log could not be read, and when no run is on record", () => {
    expect(jobsState(null, NOW).state).toBe("unknown");
    expect(jobsState(sweep({ lastRunAt: null, lastStatus: null }), NOW).state).toBe("unknown");
  });
  it("is degraded when unscheduled, when the last run failed, and when the last run is too old", () => {
    expect(jobsState(sweep({ scheduled: false }), NOW).state).toBe("degraded");
    expect(jobsState(sweep({ lastStatus: "failed" }), NOW).state).toBe("degraded");
    const stale = jobsState(sweep({ lastRunAt: "2026-11-21T10:00:00Z" }), NOW);
    expect(stale.state).toBe("degraded");
    expect(stale.reason).toMatch(/No run in the last/);
  });
  it("is healthy for a recent successful run", () => {
    expect(jobsState(sweep(), NOW)).toEqual({ state: "healthy", reason: null });
  });
});
