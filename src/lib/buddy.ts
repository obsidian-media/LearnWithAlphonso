/**
 * Study buddies (study together, Phase 3a). The server is the source of truth for the week rules
 * (`_resolve_buddy_pair` in 20261006180000_buddy_pairing.sql); this mirrors them for the clients, and the wording
 * here is identical on iOS and Android, pinned by buddy.fixtures.json.
 */

/** Distinct lessons each buddy needs in a week. Must equal `goal` in 20261006180000_buddy_pairing.sql. */
export const BUDDY_GOAL = 3;

export type BuddyOutcome = "hit" | "grace" | "miss" | "first_week";

export type BuddyStatus =
  | "requested"
  | "paired"
  | "declined"
  | "cancelled"
  | "ended"
  | "not_friends"
  | "blocked"
  | "already_paired"
  | "friend_paired"
  | "already_requested"
  | "not_found"
  | "not_paired"
  | "unauthenticated";

/** One week of the pair's streak. The week the pair was formed can only help (a Sunday pairing cannot reach the goal). */
export function resolveBuddyWeek(
  state: { streakWeeks: number; graceAvailable: boolean },
  counts: { a: number; b: number },
  isFirstWeek: boolean,
): { outcome: BuddyOutcome; streakWeeks: number; graceAvailable: boolean } {
  if (counts.a >= BUDDY_GOAL && counts.b >= BUDDY_GOAL) {
    return { outcome: "hit", streakWeeks: state.streakWeeks + 1, graceAvailable: true };
  }
  if (isFirstWeek) return { outcome: "first_week", ...state };
  if (state.graceAvailable) {
    return { outcome: "grace", streakWeeks: state.streakWeeks, graceAvailable: false };
  }
  return { outcome: "miss", streakWeeks: 0, graceAvailable: false };
}

const MESSAGES: Record<BuddyStatus | "unknown", string> = {
  requested: "Request sent. They'll see it on their Friends page.",
  paired: "You're study buddies now.",
  declined: "Request declined.",
  cancelled: "Request cancelled.",
  ended: "You're no longer study buddies.",
  not_friends: "You can only ask a friend to be your study buddy.",
  blocked: "You can't be study buddies with this person.",
  already_paired: "You already have a study buddy.",
  friend_paired: "Your friend already has a study buddy.",
  already_requested: "You've already asked them.",
  not_found: "That request is no longer open.",
  not_paired: "You don't have a study buddy.",
  unauthenticated: "Sign in to find a study buddy.",
  unknown: "Something went wrong. Try again.",
};

/** Fixed wording for a server status; a status this client does not know gets the generic message. */
export function buddyStatusMessage(status: string): string {
  return Object.prototype.hasOwnProperty.call(MESSAGES, status)
    ? MESSAGES[status as BuddyStatus]
    : MESSAGES.unknown;
}

/** "You 2/3 · Buddy 3/3 this week"; counts above the goal show as the goal. */
export function buddyWeekLine(myCount: number, buddyCount: number, goal: number): string {
  const cap = (n: number) => Math.min(n, goal);
  return `You ${cap(myCount)}/${goal} · Buddy ${cap(buddyCount)}/${goal} this week`;
}
