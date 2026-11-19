import { describe, expect, it, vi } from "vitest";
import { computeStreakUpdate } from "./progress-math";
import { localDay, streakBridge } from "./local-day";
import { syncTimeZone, TIME_ZONE_SENT_KEY } from "./learner-time-zone-sync";

const mem = () => {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};

describe("syncTimeZone", () => {
  it("sends the zone once, then not again while it is unchanged", async () => {
    const s = mem();
    const send = vi.fn().mockResolvedValue({});
    expect(await syncTimeZone({ userId: "u1", zone: "Europe/Paris", storage: s, send })).toBe(true);
    expect(await syncTimeZone({ userId: "u1", zone: "Europe/Paris", storage: s, send })).toBe(
      false,
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("Europe/Paris");
    expect(s.m.get(`${TIME_ZONE_SENT_KEY}:u1`)).toBe("Europe/Paris");
  });

  it("sends again when the zone changes, and per user", async () => {
    const s = mem();
    const send = vi.fn().mockResolvedValue({});
    await syncTimeZone({ userId: "u1", zone: "Europe/Paris", storage: s, send });
    await syncTimeZone({ userId: "u1", zone: "America/Toronto", storage: s, send });
    await syncTimeZone({ userId: "u2", zone: "America/Toronto", storage: s, send });
    expect(send.mock.calls.map((c) => c[0])).toEqual([
      "Europe/Paris",
      "America/Toronto",
      "America/Toronto",
    ]);
  });

  it("does not remember a failed send, so the next session retries", async () => {
    const s = mem();
    const send = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({});
    expect(await syncTimeZone({ userId: "u1", zone: "Asia/Tokyo", storage: s, send })).toBe(false);
    expect(s.m.size).toBe(0);
    expect(await syncTimeZone({ userId: "u1", zone: "Asia/Tokyo", storage: s, send })).toBe(true);
  });

  it("sends nothing for a missing or invalid zone", async () => {
    const send = vi.fn();
    expect(await syncTimeZone({ userId: "u1", zone: null, storage: mem(), send })).toBe(false);
    expect(await syncTimeZone({ userId: "u1", zone: "Mars/Olympus", storage: mem(), send })).toBe(
      false,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("still works when storage is blocked", async () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const send = vi.fn().mockResolvedValue({});
    expect(await syncTimeZone({ userId: "u1", zone: "Europe/Paris", storage: blocked, send })).toBe(
      true,
    );
    expect(await syncTimeZone({ userId: "u1", zone: "Europe/Paris", storage: null, send })).toBe(
      true,
    );
  });
});

describe("the day a learner's zone is first set (the UTC to local bridge)", () => {
  // 2026-11-18 01:00 in Auckland (UTC+13) is still 2026-11-17 12:00 UTC. A streak last booked on the UTC date 2026-11-16
  // therefore has a local "yesterday" two UTC dates back once the learner is local.
  const instant = Date.parse("2026-11-18T01:00:00+13:00");
  const base = { streak: 7, longestStreak: 7, freezes: 0 };

  it("a never-sent learner is still on the UTC day, and the streak basis is 'utc' (bridge on)", () => {
    expect(localDay(instant, null)).toBe("2026-11-17");
    expect(streakBridge("utc")).toBe(true);
  });

  it("the first completion after the zone is set keeps an east-of-UTC streak with no freeze spent", () => {
    const today = localDay(instant, "Pacific/Auckland");
    expect(today).toBe("2026-11-18");
    const r = computeStreakUpdate({
      ...base,
      lastActiveDate: "2026-11-16",
      today,
      bridgeUtcDay: streakBridge("utc"),
    });
    expect(r.streak).toBe(8);
    expect(r.freezes).toBe(0);
  });

  it("without the bridge the same learner would have lost the streak (the guard is real)", () => {
    const r = computeStreakUpdate({ ...base, lastActiveDate: "2026-11-16", today: "2026-11-18" });
    expect(r.streak).toBe(1);
  });

  it("after the first local write the bridge is off", () => {
    expect(streakBridge("local")).toBe(false);
  });
});
