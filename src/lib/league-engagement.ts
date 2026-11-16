import { LEAGUE_TIERS, type LeagueTier } from "../data/achievements";
import { LEAGUE_TIER_COPY } from "./league-tier-copy";

/** Just enough of a leaderboard row to see a rank change between two fetches. */
export type LeaderboardSnapshotEntry = { userId: string; xp: number };

/**
 * True when someone who ranked below `me` in `previous` now ranks above `me` in `current`. False whenever I am
 * missing from either snapshot (a first visit never reports an overtake), and someone new to `current` does not
 * count. Port of wasOvertaken in LeaderboardEngagement.swift and SocialLogic.kt.
 */
export function wasOvertaken(
  previous: LeaderboardSnapshotEntry[],
  current: LeaderboardSnapshotEntry[],
  me: string,
): boolean {
  const myPreviousRank = previous.findIndex((e) => e.userId === me);
  const myCurrentRank = current.findIndex((e) => e.userId === me);
  if (myPreviousRank < 0 || myCurrentRank < 0) return false;
  for (let currentRank = 0; currentRank < myCurrentRank; currentRank++) {
    const entry = current[currentRank];
    if (entry.userId === me) continue;
    const previousRank = previous.findIndex((e) => e.userId === entry.userId);
    if (previousRank > myPreviousRank) return true;
  }
  return false;
}

export const OVERTAKE_MESSAGE = "Someone passed you on the leaderboard!";

/** The UTC Monday that starts the week `weeksAgo` weeks before `nowMs`, as yyyy-MM-dd (the server's own week). */
export function mondayDateString(weeksAgo: number, nowMs: number): string {
  const now = new Date(nowMs);
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  return new Date(todayUtc - (daysSinceMonday + weeksAgo * 7) * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** True when `to` is a higher league than `from`; an unknown tier never counts. */
export function isLeaguePromotion(
  from: string | null | undefined,
  to: string | null | undefined,
): boolean {
  if (!from || !to) return false;
  const fromIdx = (LEAGUE_TIERS as readonly string[]).indexOf(from);
  const toIdx = (LEAGUE_TIERS as readonly string[]).indexOf(to);
  return fromIdx >= 0 && toIdx >= 0 && toIdx > fromIdx;
}

/** A week with no XP is a quiet one: Alphonso is asleep instead of cheering. */
export function recapIsQuiet(lastWeekXp: number): boolean {
  return lastWeekXp <= 0;
}

/** "You moved up to Sapling!": the new league by its display name. */
export function recapPromotionLine(tier: LeagueTier): string {
  return `You moved up to ${LEAGUE_TIER_COPY[tier].label}!`;
}

/** The promotion takeover's two lines (CD 01): "Welcome to Grove" and "You've been promoted to Grove, up from Sapling." */
export function promotionCopy(
  from: LeagueTier,
  to: LeagueTier,
): { headline: string; line: string } {
  const toLabel = LEAGUE_TIER_COPY[to].label;
  return {
    headline: `Welcome to ${toLabel}`,
    line: `You've been promoted to ${toLabel}, up from ${LEAGUE_TIER_COPY[from].label}.`,
  };
}

const snapshotKey = (userId: string) => `lwa.leaderboardSnapshot.${userId}`;
const recapTierKey = (userId: string) => `lwa.lastRecapTier.${userId}`;

export function loadSnapshot(
  userId: string,
  storage: Pick<Storage, "getItem"> | null,
): LeaderboardSnapshotEntry[] | null {
  try {
    const raw = storage?.getItem(snapshotKey(userId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const out: LeaderboardSnapshotEntry[] = [];
    for (const row of parsed) {
      if (row && typeof row.userId === "string" && typeof row.xp === "number")
        out.push({ userId: row.userId, xp: row.xp });
      else return null;
    }
    return out;
  } catch {
    return null;
  }
}

export function saveSnapshot(
  userId: string,
  snapshot: LeaderboardSnapshotEntry[],
  storage: Pick<Storage, "setItem"> | null,
) {
  try {
    storage?.setItem(snapshotKey(userId), JSON.stringify(snapshot));
  } catch {
    // Not saving only means no overtake notice next time.
  }
}

export function loadRecapTier(
  userId: string,
  storage: Pick<Storage, "getItem"> | null,
): string | null {
  try {
    return storage?.getItem(recapTierKey(userId)) ?? null;
  } catch {
    return null;
  }
}

export function saveRecapTier(
  userId: string,
  tier: string,
  storage: Pick<Storage, "setItem"> | null,
) {
  try {
    storage?.setItem(recapTierKey(userId), tier);
  } catch {
    // The promotion line may show once more; harmless.
  }
}
