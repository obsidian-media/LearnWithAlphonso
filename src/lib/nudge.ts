/**
 * Nudge a friend, the web side. Same rules as the apps (NudgeCooldownCache.swift, NudgeCooldown in SocialLogic.kt):
 * one nudge per friend per 24 hours, kept as a soft cooldown on this device so the button greys out with no round
 * trip. The database enforces the same window on the push itself (20260930070000_nudge_push_rate_limit.sql), so a
 * client that skips this still cannot buzz a friend's phone twice inside it.
 */
export const NUDGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Never nudged means allowed; otherwise a full 24 hours must have passed. */
export function canNudge(lastNudgedAtMs: number | null | undefined, nowMs: number): boolean {
  if (lastNudgedAtMs === null || lastNudgedAtMs === undefined) return true;
  return nowMs - lastNudgedAtMs >= NUDGE_COOLDOWN_MS;
}

export type NudgeCooldowns = Record<string, number>;

const cooldownKey = (userId: string) => `lwa.nudgeCooldowns.${userId}`;

/** The saved cooldowns for this learner on this device. A missing, blocked or damaged store reads as none. */
export function loadNudgeCooldowns(
  userId: string,
  storage: Pick<Storage, "getItem"> | null,
): NudgeCooldowns {
  try {
    const raw = storage?.getItem(cooldownKey(userId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const out: NudgeCooldowns = {};
    for (const [friendId, at] of Object.entries(parsed)) {
      if (typeof at === "number" && Number.isFinite(at)) out[friendId] = at;
    }
    return out;
  } catch {
    return {};
  }
}

/** Records a nudge to `friendId`, returning the new map. Storage failures are swallowed: the button just resets. */
export function recordNudge(
  userId: string,
  friendId: string,
  nowMs: number,
  storage: Pick<Storage, "getItem" | "setItem"> | null,
): NudgeCooldowns {
  const next = { ...loadNudgeCooldowns(userId, storage), [friendId]: nowMs };
  try {
    storage?.setItem(cooldownKey(userId), JSON.stringify(next));
  } catch {
    // A private window or a full store: the in-memory copy still holds for this visit.
  }
  return next;
}

/** The toast when unread nudges are found: one friend by name, several by count. */
export function nudgeToastMessage(senderNames: string[]): string {
  return senderNames.length === 1
    ? `${senderNames[0]} nudged you!`
    : `${senderNames.length} friends nudged you!`;
}

/** The sender's name from the friends already loaded; a sender who is no longer a friend reads as "A friend". */
export function nudgeSenderName(
  senderId: string,
  friends: { userId: string; displayName: string }[],
): string {
  return friends.find((f) => f.userId === senderId)?.displayName ?? "A friend";
}
