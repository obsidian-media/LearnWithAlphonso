import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Proves a lesson-completion claim followed a real "the client opened this
 * lesson" event, closing the remaining gap noted in AUDIT.md §1.4: today's
 * completeLessonRemote validates the lesson exists and that claimed-missed
 * question ids are real, but nothing previously stopped a request claiming
 * a lesson was completed without ever starting it. A stateless HMAC token
 * (no DB round trip, no new table) is enough here -- the goal is raising
 * the bar past "a raw fetch to the server function," not building
 * anti-cheat for a graded exam.
 */

const MAX_AGE_MS = 3 * 60 * 60 * 1000; // generous: covers the vocab + quiz phases plus real-world pauses

export type LessonSessionClaim = {
  userId: string;
  lessonId: string;
  course: string;
};

function secret(): string {
  const s = process.env.LESSON_SESSION_SECRET;
  if (!s) {
    throw new Error(
      "Missing LESSON_SESSION_SECRET environment variable. Set it in .env / your host's environment settings.",
    );
  }
  return s;
}

function sign(payloadB64: string): string {
  return createHmac("sha256", secret()).update(payloadB64).digest("base64url");
}

export function issueLessonSessionToken(claim: LessonSessionClaim): string {
  const payload = { ...claim, iat: Date.now() };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifyLessonSessionToken(token: string, expected: LessonSessionClaim): boolean {
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return false;

  const expectedSigBuf = Buffer.from(sign(payloadB64));
  const sigBuf = Buffer.from(sig);
  if (sigBuf.length !== expectedSigBuf.length || !timingSafeEqual(sigBuf, expectedSigBuf)) {
    return false;
  }

  let payload: LessonSessionClaim & { iat: number };
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return false;
  }

  if (payload.userId !== expected.userId) return false;
  if (payload.lessonId !== expected.lessonId) return false;
  if (payload.course !== expected.course) return false;
  if (typeof payload.iat !== "number" || Date.now() - payload.iat > MAX_AGE_MS) return false;

  return true;
}
