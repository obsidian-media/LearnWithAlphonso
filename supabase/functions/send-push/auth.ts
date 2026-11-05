// Who may ask send-push to notify a user: only this project's own database trigger (notify_nudge_push).
//
// Preferred: the dedicated random secret in the X-Send-Push-Secret header, compared in constant time with the
// function's SEND_PUSH_SECRET. The trigger reads it from Vault ('send_push_secret'), so the service role key never
// sits in pg_net's request queue. Still accepted: `Authorization: Bearer <service role key>`, which the trigger sends
// until the Vault secret exists; anyone holding that key can already do everything this function does.
import { createHash, timingSafeEqual } from "node:crypto";

const MIN_SECRET_LENGTH = 32;

// Compares SHA-256 digests, so both sides are always 32 bytes and the timing does not reveal the secret's length.
function matches(expected: string, given: string): boolean {
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(expected), digest(given));
}

export function isAuthorizedPushCaller(
  req: Request,
  env: { pushSecret?: string; serviceRoleKey?: string },
): boolean {
  const pushSecret = env.pushSecret ?? "";
  const givenSecret = req.headers.get("x-send-push-secret");
  if (pushSecret.length >= MIN_SECRET_LENGTH && givenSecret !== null && matches(pushSecret, givenSecret)) {
    return true;
  }
  const serviceRoleKey = env.serviceRoleKey ?? "";
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return serviceRoleKey.length > 0 && bearer.length > 0 && matches(serviceRoleKey, bearer);
}
