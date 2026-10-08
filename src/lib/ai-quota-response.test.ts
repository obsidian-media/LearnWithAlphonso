import { describe, expect, it } from "vitest";
import { nextMinute, nextUtcMidnight, quotaFailureResponse } from "./ai-quota-response";

describe("quota reset times", () => {
  it("daily caps reset at the next UTC midnight", () => {
    expect(nextUtcMidnight(new Date("2026-10-07T18:00:00Z"))).toBe("2026-10-08T00:00:00.000Z");
    expect(nextUtcMidnight(new Date("2026-10-07T00:00:00Z"))).toBe("2026-10-08T00:00:00.000Z");
    expect(nextUtcMidnight(new Date("2026-12-31T23:59:59Z"))).toBe("2027-01-01T00:00:00.000Z");
  });

  it("the per-minute burst resets at the start of the next minute", () => {
    expect(nextMinute(new Date("2026-10-07T18:00:40.500Z"))).toBe("2026-10-07T18:01:00.000Z");
    expect(nextMinute(new Date("2026-10-07T18:00:00Z"))).toBe("2026-10-07T18:01:00.000Z");
  });
});

describe("quotaFailureResponse", () => {
  it("normalizes a 429 to the quota-exceeded contract and keeps the human message", async () => {
    const res = quotaFailureResponse({
      status: 429,
      message: "Daily CHAT limit reached (60/day). Try again tomorrow.",
      resetsAt: "2026-10-08T00:00:00.000Z",
    });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: "quota-exceeded",
      resetsAt: "2026-10-08T00:00:00.000Z",
      message: "Daily CHAT limit reached (60/day). Try again tomorrow.",
    });
  });

  it("sends resetsAt: null when the caller did not know it", async () => {
    const res = quotaFailureResponse({ status: 429, message: "x" });
    expect(await res.json()).toEqual({ error: "quota-exceeded", resetsAt: null, message: "x" });
  });

  it("passes non-quota failures through in the old shape", async () => {
    const res = quotaFailureResponse({ status: 401, message: "Sign in to use AI features." });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sign in to use AI features." });
  });
});
