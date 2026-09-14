import { beforeAll, describe, expect, it, vi } from "vitest";
import { issueLessonSessionToken, verifyLessonSessionToken } from "./lesson-session.server";

beforeAll(() => {
  process.env.LESSON_SESSION_SECRET = "test-secret-do-not-use-in-prod";
});

const claim = { userId: "user-1", lessonId: "u1l1", course: "en" };

describe("lesson session tokens", () => {
  it("verifies a token issued for the same claim", () => {
    const token = issueLessonSessionToken(claim);
    expect(verifyLessonSessionToken(token, claim)).toBe(true);
  });

  it("rejects a token issued for a different user", () => {
    const token = issueLessonSessionToken(claim);
    expect(verifyLessonSessionToken(token, { ...claim, userId: "user-2" })).toBe(false);
  });

  it("rejects a token issued for a different lesson", () => {
    const token = issueLessonSessionToken(claim);
    expect(verifyLessonSessionToken(token, { ...claim, lessonId: "u1l2" })).toBe(false);
  });

  it("rejects a token issued for a different course", () => {
    const token = issueLessonSessionToken(claim);
    expect(verifyLessonSessionToken(token, { ...claim, course: "fr" })).toBe(false);
  });

  it("rejects a tampered payload", () => {
    const token = issueLessonSessionToken(claim);
    const [payloadB64, sig] = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...claim, iat: Date.now() }).replace("user-1", "user-2"),
    ).toString("base64url");
    expect(verifyLessonSessionToken(`${tamperedPayload}.${sig}`, claim)).toBe(false);
    expect(payloadB64).not.toBe(tamperedPayload); // sanity: tamper actually changed it
  });

  it("rejects a malformed token", () => {
    expect(verifyLessonSessionToken("not-a-real-token", claim)).toBe(false);
    expect(verifyLessonSessionToken("", claim)).toBe(false);
  });

  it("accepts a token just under the 3-hour max age and rejects one just over it", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-13T12:00:00Z"));
      const token = issueLessonSessionToken(claim);

      vi.setSystemTime(new Date("2026-09-13T14:59:00Z")); // +2h59m
      expect(verifyLessonSessionToken(token, claim)).toBe(true);

      vi.setSystemTime(new Date("2026-09-13T15:01:00Z")); // +3h01m
      expect(verifyLessonSessionToken(token, claim)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
