import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * The "hector turn" token: what lets the web client fetch the SPOKEN version of one Hector reply from /api/tts after
 * /api/hector-respond has already answered with the text. The turn already spent its quota unit (Hector's own daily
 * allowance); this token is what makes the speech of exactly that reply free of a second one.
 *
 * It authorises one thing: speech of exactly this text, for this user, until it expires. It is an HMAC over
 * `hector-turn:v1|userId|sha256(text)|expiry`, so a changed text, another user or a late request does not verify.
 * Nothing is stored. The key is the existing LESSON_SESSION_SECRET (as the call recap token does); the
 * `hector-turn:v1|` prefix is domain separation, so a lesson-session token or a recap token can never verify as a
 * turn token, nor the reverse.
 */
export const HECTOR_TURN_TTL_MS = 2 * 60 * 1000;

const DOMAIN = "hector-turn:v1";

function secret(): string {
  const s = process.env.LESSON_SESSION_SECRET;
  if (!s) throw new Error("LESSON_SESSION_SECRET is not set");
  return s;
}

function textHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function sign(userId: string, text: string, expiresAt: number): string {
  return createHmac("sha256", secret())
    .update(`${DOMAIN}|${userId}|${textHash(text)}|${expiresAt}`)
    .digest("base64url");
}

/** `<expiry ms>.<signature>`. Throws when the secret is missing (the caller then answers with inline audio). */
export function issueHectorTurnToken(userId: string, text: string, now = Date.now()): string {
  const expiresAt = now + HECTOR_TURN_TTL_MS;
  return `${expiresAt}.${sign(userId, text, expiresAt)}`;
}

export function verifyHectorTurnToken(
  token: string,
  userId: string,
  text: string,
  now = Date.now(),
): boolean {
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const expiresAt = Number(token.slice(0, dot));
  if (!Number.isSafeInteger(expiresAt) || now > expiresAt) return false;
  // An expiry from the far future would outlive the window: the signature covers it, but refuse it anyway.
  if (expiresAt - now > HECTOR_TURN_TTL_MS) return false;
  let expected: Buffer;
  try {
    expected = Buffer.from(sign(userId, text, expiresAt));
  } catch {
    return false;
  }
  const given = Buffer.from(token.slice(dot + 1));
  return given.length === expected.length && timingSafeEqual(given, expected);
}
