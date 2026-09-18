// Deno port of src/lib/lesson-session.server.ts's verification side only
// (this function never issues tokens -- startLessonSession, which issues
// them, stays a TanStack Start server function). Uses Deno's Node compat
// layer (node:crypto) for createHmac/timingSafeEqual, exactly as the
// design doc anticipated. MUST use the same LESSON_SESSION_SECRET value
// as the web app's server, or tokens issued by one side won't verify on
// the other -- see this Edge Function's README/deployment notes.
import { createHmac, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

const MAX_AGE_MS = 3 * 60 * 60 * 1000; // matches lesson-session.server.ts

export type LessonSessionClaim = {
  userId: string;
  lessonId: string;
  course: string;
};

function secret(): string {
  const s = Deno.env.get("LESSON_SESSION_SECRET");
  if (!s) {
    throw new Error("Missing LESSON_SESSION_SECRET environment variable.");
  }
  return s;
}

function sign(payloadB64: string): string {
  return createHmac("sha256", secret()).update(payloadB64).digest("base64url");
}

export function verifyLessonSessionToken(
  token: string,
  expected: LessonSessionClaim,
): boolean {
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return false;

  const expectedSigBuf = Buffer.from(sign(payloadB64));
  const sigBuf = Buffer.from(sig);
  if (
    sigBuf.length !== expectedSigBuf.length ||
    !timingSafeEqual(sigBuf, expectedSigBuf)
  ) {
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
  if (
    typeof payload.iat !== "number" || Date.now() - payload.iat > MAX_AGE_MS
  ) return false;

  return true;
}
