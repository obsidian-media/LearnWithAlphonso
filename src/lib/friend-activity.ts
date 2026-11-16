import { LEAGUE_TIER_COPY } from "./league-tier-copy";

export type FriendActivityEvent = {
  id: string;
  userId: string;
  eventType: string;
  createdAt: string;
  xpGain: number | null;
  streak: number | null;
  newTier: string | null;
};

/** The tier's display name; a tier this build does not know is shown capitalised, as on iOS. */
function tierLabel(tier: string): string {
  if (Object.hasOwn(LEAGUE_TIER_COPY, tier))
    return LEAGUE_TIER_COPY[tier as keyof typeof LEAGUE_TIER_COPY].label;
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

/** What the feed says for one event, word for word as on iOS and Android. */
export function activityCopy(event: FriendActivityEvent, name: string): string {
  switch (event.eventType) {
    case "lesson_completed":
      return `${name} completed a lesson (+${event.xpGain ?? 0} XP)`;
    case "streak_milestone":
      return `${name} hit a ${event.streak ?? 0}-day streak`;
    case "league_promotion": {
      const tier = event.newTier ? tierLabel(event.newTier) : "a new league";
      return `${name} moved up to ${tier}`;
    }
    default:
      return `${name} made progress`;
  }
}

/** The 3D icon for each kind of event: a tick, a flame, a trophy, and sparkles for one this build does not know. */
export function activityIcon(eventType: string): string {
  switch (eventType) {
    case "lesson_completed":
      return "check_mark_button";
    case "streak_milestone":
      return "fire";
    case "league_promotion":
      return "trophy";
    default:
      return "sparkles";
  }
}

/** "You" for the learner's own events, the friend's name from the loaded list, or "A friend". */
export function activityName(
  userId: string,
  me: string | null,
  friends: { userId: string; displayName: string }[],
): string {
  if (me !== null && userId === me) return "You";
  return friends.find((f) => f.userId === userId)?.displayName ?? "A friend";
}
