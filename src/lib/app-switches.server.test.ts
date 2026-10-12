import { beforeEach, describe, expect, it, vi } from "vitest";
import { isSwitchOn, resetSwitchCache, SWITCH_CACHE_MS } from "./app-switches.server";

type Result = {
  data: { key: string; enabled: boolean }[] | null;
  error: { message: string } | null;
};

function reader(results: Result[]) {
  const select = vi.fn(async () => results.shift() ?? { data: null, error: { message: "empty" } });
  return { db: { from: () => ({ select }) }, select };
}

const rows = (ai: boolean, tutor: boolean) => ({
  data: [
    { key: "ai", enabled: ai },
    { key: "tutor", enabled: tutor },
  ],
  error: null,
});

beforeEach(() => {
  resetSwitchCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("isSwitchOn", () => {
  it("is on by default and off only when stored as off", async () => {
    const { db } = reader([rows(true, false)]);
    expect(await isSwitchOn("ai", { db, now: 0 })).toBe(true);
    expect(await isSwitchOn("tutor", { db, now: 1 })).toBe(false);
  });

  it("treats a switch with no row as on", async () => {
    const { db } = reader([{ data: [], error: null }]);
    expect(await isSwitchOn("ai", { db, now: 0 })).toBe(true);
  });

  it("reads once per cache window, then picks up a change", async () => {
    const { db, select } = reader([rows(true, true), rows(false, true)]);
    expect(await isSwitchOn("ai", { db, now: 0 })).toBe(true);
    expect(await isSwitchOn("ai", { db, now: SWITCH_CACHE_MS - 1 })).toBe(true);
    expect(select).toHaveBeenCalledTimes(1);
    expect(await isSwitchOn("ai", { db, now: SWITCH_CACHE_MS })).toBe(false);
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("counts a failed first read as on, and tries again on the next call", async () => {
    const { db, select } = reader([{ data: null, error: { message: "down" } }, rows(false, true)]);
    expect(await isSwitchOn("ai", { db, now: 0 })).toBe(true);
    expect(await isSwitchOn("ai", { db, now: 1 })).toBe(false);
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("keeps a switch off through a failed re-read", async () => {
    const { db } = reader([rows(false, true), { data: null, error: { message: "down" } }]);
    expect(await isSwitchOn("ai", { db, now: 0 })).toBe(false);
    expect(await isSwitchOn("ai", { db, now: SWITCH_CACHE_MS })).toBe(false);
  });
});
