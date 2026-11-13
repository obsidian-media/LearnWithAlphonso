import { describe, expect, it } from "vitest";
import {
  HECTOR_DAILY_LIMIT,
  HECTOR_OUT_FOR_TODAY,
  hectorAllowanceUsedUp,
  utcDay,
} from "./hector-allowance";

/**
 * The learner's daily Hector allowance (BACKLOG 0.0-bq #5): consume_ai_quota refuses the call that would take
 * today's count past the limit, so the allowance is used up once the count has reached it. Mirrored on iOS
 * (HectorAllowance.swift) and Android (HectorAllowance.kt).
 */
describe("hectorAllowanceUsedUp", () => {
  it("is not used up with no usage row today", () => {
    expect(hectorAllowanceUsedUp([])).toBe(false);
    expect(hectorAllowanceUsedUp(null)).toBe(false);
  });
  it("is not used up one short of the limit: that turn is still allowed", () => {
    expect(hectorAllowanceUsedUp([{ count: HECTOR_DAILY_LIMIT - 1 }])).toBe(false);
  });
  it("is used up at the limit and past it", () => {
    expect(hectorAllowanceUsedUp([{ count: HECTOR_DAILY_LIMIT }])).toBe(true);
    expect(hectorAllowanceUsedUp([{ count: HECTOR_DAILY_LIMIT + 3 }])).toBe(true);
  });
  it("ignores a malformed row instead of locking the learner out", () => {
    expect(hectorAllowanceUsedUp([{ count: Number.NaN }])).toBe(false);
    expect(hectorAllowanceUsedUp([{ count: "999" as unknown as number }])).toBe(false);
  });
  it("matches the limit the database enforces", () => {
    expect(HECTOR_DAILY_LIMIT).toBe(150);
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
