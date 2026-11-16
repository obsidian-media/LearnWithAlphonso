import { assertEquals } from "jsr:@std/assert@1";
import { createHmac } from "node:crypto";
import { Buffer } from "node:buffer";
import { lessonSessionIssuedAt, verifyLessonSessionToken } from "./lesson-session.ts";
import { LIVE_SESSION_MAX_AGE_MS, OFFLINE_SESSION_MAX_AGE_MS } from "./offline-completion-date.ts";

const CLAIM = { userId: "u1", lessonId: "u1l1", course: "en" };

function tokenIssuedAgo(ageMs: number): string {
  Deno.env.set("LESSON_SESSION_SECRET", "test-secret");
  const payloadB64 = Buffer.from(JSON.stringify({ ...CLAIM, iat: Date.now() - ageMs })).toString("base64url");
  return `${payloadB64}.${createHmac("sha256", "test-secret").update(payloadB64).digest("base64url")}`;
}

const HOUR = 60 * 60 * 1000;

Deno.test("the default window is the live 3 hours", () => {
  assertEquals(verifyLessonSessionToken(tokenIssuedAgo(2 * HOUR), CLAIM), true);
  assertEquals(verifyLessonSessionToken(tokenIssuedAgo(4 * HOUR), CLAIM), false);
  assertEquals(LIVE_SESSION_MAX_AGE_MS, 3 * HOUR);
});

Deno.test("a longer window accepts an overnight session but still not one past it", () => {
  const overnight = tokenIssuedAgo(13 * HOUR);
  assertEquals(verifyLessonSessionToken(overnight, CLAIM, OFFLINE_SESSION_MAX_AGE_MS), true);
  assertEquals(typeof lessonSessionIssuedAt(overnight, CLAIM, OFFLINE_SESSION_MAX_AGE_MS), "number");
  assertEquals(verifyLessonSessionToken(tokenIssuedAgo(49 * HOUR), CLAIM, OFFLINE_SESSION_MAX_AGE_MS), false);
});

Deno.test("a longer window never loosens the signature, user, lesson or course checks", () => {
  const good = tokenIssuedAgo(HOUR);
  assertEquals(verifyLessonSessionToken(good, { ...CLAIM, userId: "other" }, OFFLINE_SESSION_MAX_AGE_MS), false);
  assertEquals(verifyLessonSessionToken(good, { ...CLAIM, lessonId: "u1l2" }, OFFLINE_SESSION_MAX_AGE_MS), false);
  assertEquals(verifyLessonSessionToken(good, { ...CLAIM, course: "fr" }, OFFLINE_SESSION_MAX_AGE_MS), false);
  assertEquals(verifyLessonSessionToken(good.slice(0, -2) + "xx", CLAIM, OFFLINE_SESSION_MAX_AGE_MS), false);
});
