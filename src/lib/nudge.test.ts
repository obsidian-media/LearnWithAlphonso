import { describe, expect, it } from "vitest";
import {
  canNudge,
  loadNudgeCooldowns,
  NUDGE_COOLDOWN_MS,
  nudgeSenderName,
  nudgeToastMessage,
  recordNudge,
} from "./nudge";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    data,
  };
}

describe("canNudge (24 hour cooldown, as NudgeCooldown on Android and NudgeCooldownCache on iOS)", () => {
  const NOW = 1_800_000_000_000;

  it("allows a friend who was never nudged", () => {
    expect(canNudge(null, NOW)).toBe(true);
    expect(canNudge(undefined, NOW)).toBe(true);
  });

  it("refuses inside the window, one millisecond short of 24 hours included", () => {
    expect(canNudge(NOW - 1, NOW)).toBe(false);
    expect(canNudge(NOW - NUDGE_COOLDOWN_MS + 1, NOW)).toBe(false);
  });

  it("allows again at exactly 24 hours and after", () => {
    expect(canNudge(NOW - NUDGE_COOLDOWN_MS, NOW)).toBe(true);
    expect(canNudge(NOW - NUDGE_COOLDOWN_MS - 1, NOW)).toBe(true);
  });

  it("keeps the window at 24 hours, the same as the database's push limit", () => {
    expect(NUDGE_COOLDOWN_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe("the saved cooldowns", () => {
  it("round-trips per learner, so one account never sees another's cooldowns", () => {
    const storage = memoryStorage();
    recordNudge("me", "friend-a", 1000, storage);
    recordNudge("me", "friend-b", 2000, storage);
    recordNudge("someone-else", "friend-a", 3000, storage);
    expect(loadNudgeCooldowns("me", storage)).toEqual({ "friend-a": 1000, "friend-b": 2000 });
    expect(loadNudgeCooldowns("someone-else", storage)).toEqual({ "friend-a": 3000 });
  });

  it("reads damaged data as no cooldowns, never throws", () => {
    expect(loadNudgeCooldowns("me", memoryStorage({ "lwa.nudgeCooldowns.me": "{nope" }))).toEqual(
      {},
    );
    expect(loadNudgeCooldowns("me", memoryStorage({ "lwa.nudgeCooldowns.me": "[1,2]" }))).toEqual(
      {},
    );
    expect(
      loadNudgeCooldowns("me", memoryStorage({ "lwa.nudgeCooldowns.me": '{"a":"x","b":5}' })),
    ).toEqual({ b: 5 });
    expect(loadNudgeCooldowns("me", null)).toEqual({});
  });

  it("keeps working in memory when storage refuses writes", () => {
    const blocked = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(recordNudge("me", "f", 7, blocked)).toEqual({ f: 7 });
    expect(recordNudge("me", "f", 7, null)).toEqual({ f: 7 });
  });
});

describe("nudge toast", () => {
  it("names one friend and counts several", () => {
    expect(nudgeToastMessage(["Mina"])).toBe("Mina nudged you!");
    expect(nudgeToastMessage(["Mina", "Jon"])).toBe("2 friends nudged you!");
  });

  it("calls a sender who is no longer a friend 'A friend'", () => {
    const friends = [{ userId: "a", displayName: "Mina" }];
    expect(nudgeSenderName("a", friends)).toBe("Mina");
    expect(nudgeSenderName("gone", friends)).toBe("A friend");
  });
});
