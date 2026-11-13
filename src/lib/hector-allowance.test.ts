import { describe, expect, it, vi } from "vitest";
import {
  HECTOR_OUT_FOR_TODAY,
  fetchHectorDailyLimit,
  hectorAllowanceUsedUp,
  hectorDailyLimitFrom,
  utcDay,
} from "./hector-allowance";

/**
 * The learner's daily Hector allowance (BACKLOG 0.0-bq #5): consume_ai_quota refuses the call that would take
 * today's count past the limit, so the allowance is used up once the count has reached it. The limit is not a
 * constant here: the server says it (GET /api/app-config, limits.hectorDaily), and with no limit the allowance is
 * never "used up" (fail open: the server still refuses the turn). Mirrored on iOS (HectorAllowance.swift) and
 * Android (HectorAllowance.kt).
 */
describe("hectorAllowanceUsedUp", () => {
  it("is not used up with no usage row today", () => {
    expect(hectorAllowanceUsedUp([], 150)).toBe(false);
    expect(hectorAllowanceUsedUp(null, 150)).toBe(false);
  });
  it("is not used up one short of the limit: that turn is still allowed", () => {
    expect(hectorAllowanceUsedUp([{ count: 149 }], 150)).toBe(false);
  });
  it("is used up at the limit and past it, whatever the server's limit is", () => {
    expect(hectorAllowanceUsedUp([{ count: 150 }], 150)).toBe(true);
    expect(hectorAllowanceUsedUp([{ count: 153 }], 150)).toBe(true);
    expect(hectorAllowanceUsedUp([{ count: 150 }], 200)).toBe(false);
    expect(hectorAllowanceUsedUp([{ count: 40 }], 40)).toBe(true);
  });
  it("fails open when the server gave no limit", () => {
    expect(hectorAllowanceUsedUp([{ count: 99999 }], null)).toBe(false);
    expect(hectorAllowanceUsedUp([{ count: 99999 }], undefined)).toBe(false);
  });
  it("ignores a malformed row instead of locking the learner out", () => {
    expect(hectorAllowanceUsedUp([{ count: Number.NaN }], 150)).toBe(false);
    expect(hectorAllowanceUsedUp([{ count: "999" as unknown as number }], 150)).toBe(false);
  });
});

describe("the limit the server tells", () => {
  it("reads limits.hectorDaily, a positive whole number, and nothing else", () => {
    expect(hectorDailyLimitFrom({ limits: { hectorDaily: 150 } })).toBe(150);
    for (const bad of [
      null,
      {},
      { limits: {} },
      { limits: { hectorDaily: 0 } },
      { limits: { hectorDaily: -3 } },
      { limits: { hectorDaily: 1.5 } },
      { limits: { hectorDaily: "150" } },
    ])
      expect(hectorDailyLimitFrom(bad)).toBeNull();
  });
  it("fetches it from /api/app-config and answers null on any failure", async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify({ limits: { hectorDaily: 120 } })));
    expect(await fetchHectorDailyLimit(ok as unknown as typeof fetch)).toBe(120);
    expect(ok).toHaveBeenCalledWith("/api/app-config");
    expect(
      await fetchHectorDailyLimit(
        (async () => new Response("no", { status: 500 })) as unknown as typeof fetch,
      ),
    ).toBeNull();
    expect(
      await fetchHectorDailyLimit((async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch),
    ).toBeNull();
    expect(
      await fetchHectorDailyLimit(
        (async () => new Response("not json")) as unknown as typeof fetch,
      ),
    ).toBeNull();
  });
});

describe("utcDay", () => {
  it("is the UTC date, which is what consume_ai_quota keys on (current_date on a UTC database)", () => {
    expect(utcDay(new Date("2026-11-12T23:59:59Z"))).toBe("2026-11-12");
    expect(utcDay(new Date("2026-11-13T00:00:00Z"))).toBe("2026-11-13");
  });
});

it("the out-for-today copy is the one the server's quota refusal shows", () => {
  expect(HECTOR_OUT_FOR_TODAY).toBe(
    "You've reached today's AI practice limit. Try again tomorrow.",
  );
});
