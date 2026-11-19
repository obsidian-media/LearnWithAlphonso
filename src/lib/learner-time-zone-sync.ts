/**
 * Sends the browser's IANA time zone to the server once per signed-in user, and again only when it changes (the server
 * books every learner day, streak and daily goal from it). The last zone sent is remembered per user in localStorage;
 * a blocked or failing storage just means the zone is sent again, which the server treats as a no-op.
 */
import { isValidTimeZone } from "./profile-data";

export const TIME_ZONE_SENT_KEY = "lwa.time-zone-sent.v1";

type Area = Pick<Storage, "getItem" | "setItem">;

export function deviceTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}

/** Resolves true when a zone was sent, false when nothing was needed or the send failed. Never throws. */
export async function syncTimeZone(opts: {
  userId: string;
  zone: string | null;
  storage: Area | null;
  send: (zone: string) => Promise<unknown>;
}): Promise<boolean> {
  const { userId, zone, storage, send } = opts;
  if (!zone || !isValidTimeZone(zone)) return false;
  const key = `${TIME_ZONE_SENT_KEY}:${userId}`;
  try {
    if (storage?.getItem(key) === zone) return false;
  } catch {
    // unreadable storage: send anyway
  }
  try {
    await send(zone);
  } catch {
    return false; // not remembered, so the next session retries
  }
  try {
    storage?.setItem(key, zone);
  } catch {
    // blocked storage: harmless
  }
  return true;
}
