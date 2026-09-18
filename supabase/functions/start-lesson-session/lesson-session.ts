// Deno port of src/lib/lesson-session.server.ts's issuing side (the
// verifying side lives in supabase/functions/complete-lesson/lesson-session.ts
// -- each Edge Function bundles its own copy, since Supabase bundles every
// function directory independently and a relative import reaching outside
// supabase/functions/<name>/ is not reliably resolvable). MUST use the same
// LESSON_SESSION_SECRET value as the web app's server and as the
// complete-lesson function, or a token issued here won't verify there.
import { createHmac } from "node:crypto";
import { Buffer } from "node:buffer";

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

export function issueLessonSessionToken(claim: LessonSessionClaim): string {
  const payload = { ...claim, iat: Date.now() };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}
