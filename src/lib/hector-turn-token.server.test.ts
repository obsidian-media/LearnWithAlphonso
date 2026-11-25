import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  HECTOR_TURN_TTL_MS,
  issueHectorTurnToken,
  verifyHectorTurnToken,
} from "./hector-turn-token.server";
import { issueLessonSessionToken } from "./lesson-session.server";
import { issueRecapToken } from "./call-recap.server";

const NOW = 1_800_000_000_000;

beforeEach(() => {
  process.env.LESSON_SESSION_SECRET = "test-secret-for-turn-tokens";
});
afterEach(() => {
  delete process.env.LESSON_SESSION_SECRET;
});

describe("the hector turn token", () => {
  it("verifies for the same user and exactly the same text, within its window", () => {
    const t = issueHectorTurnToken("u1", "Bonjour, ça va ?", NOW);
    expect(verifyHectorTurnToken(t, "u1", "Bonjour, ça va ?", NOW + 1000)).toBe(true);
    expect(verifyHectorTurnToken(t, "u1", "Bonjour, ça va ?", NOW + HECTOR_TURN_TTL_MS)).toBe(true);
  });

  it("does not verify for another user, a changed text or a late request", () => {
    const t = issueHectorTurnToken("u1", "Bonjour", NOW);
    expect(verifyHectorTurnToken(t, "u2", "Bonjour", NOW)).toBe(false);
    expect(verifyHectorTurnToken(t, "u1", "Bonjour.", NOW)).toBe(false);
    expect(verifyHectorTurnToken(t, "u1", "Bonjour", NOW + HECTOR_TURN_TTL_MS + 1)).toBe(false);
  });

  it("does not verify with a tampered expiry or signature", () => {
    const t = issueHectorTurnToken("u1", "Bonjour", NOW);
    const [exp, sig] = t.split(".");
    expect(verifyHectorTurnToken(`${Number(exp) + 60_000}.${sig}`, "u1", "Bonjour", NOW)).toBe(
      false,
    );
    expect(verifyHectorTurnToken(`${exp}.${sig}x`, "u1", "Bonjour", NOW)).toBe(false);
    expect(verifyHectorTurnToken("garbage", "u1", "Bonjour", NOW)).toBe(false);
    expect(verifyHectorTurnToken("", "u1", "Bonjour", NOW)).toBe(false);
  });

  it("refuses an expiry beyond the window even if it were signed", () => {
    const t = issueHectorTurnToken("u1", "Bonjour", NOW + 10 * 60_000);
    expect(verifyHectorTurnToken(t, "u1", "Bonjour", NOW)).toBe(false);
  });

  it("is domain-separated: a lesson-session or recap token never verifies as a turn token", () => {
    const lesson = issueLessonSessionToken({ userId: "u1", lessonId: "l", course: "en" });
    expect(verifyHectorTurnToken(lesson, "u1", "l", NOW)).toBe(false);
    const recap = issueRecapToken("u1", "call", "en", { corrections: [], phrase: null } as never);
    expect(verifyHectorTurnToken(recap, "u1", "call", NOW)).toBe(false);
  });

  it("a turn token is not a lesson token either", async () => {
    const { verifyLessonSessionToken } = await import("./lesson-session.server");
    const t = issueHectorTurnToken("u1", "Bonjour", Date.now());
    expect(verifyLessonSessionToken(t, { userId: "u1", lessonId: "Bonjour", course: "en" })).toBe(
      false,
    );
  });

  it("throws without the secret, so the turn falls back to inline audio", () => {
    delete process.env.LESSON_SESSION_SECRET;
    expect(() => issueHectorTurnToken("u1", "x")).toThrow();
    expect(verifyHectorTurnToken("1.abc", "u1", "x")).toBe(false);
  });
});
