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
  | "unauthenticated"
  | "sent"
  | "rate_limited"
  | "bad_preset"
  | "waiting"
  | "left"
  | "not_waiting"
  | "matching_off"
  | "not_studying"
  | "age_required"
  | "too_many_tries"
  | "match_limit"
  | "matching_paused";

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
  sent: "Sent.",
  rate_limited: "You've sent a lot of messages. Try again in a while.",
  bad_preset: "Something went wrong. Try again.",
  waiting: "You're on the list. We'll pair you with a learner at your level.",
  left: "You've stopped looking for a study buddy.",
  not_waiting: "You weren't looking for a study buddy.",
  matching_off: "Finding a study buddy isn't available right now.",
  not_studying: "Start that course first, then look for a study buddy.",
  age_required: "Please confirm you're 13 or older to be matched with another learner.",
  too_many_tries: "You've tried a lot just now. Try again in an hour.",
  match_limit: "You've been matched with a few learners this week. Try again in a few days.",
  matching_paused: "Messages with matched learners are paused right now. Your progress is kept.",
  unknown: "Something went wrong. Try again.",
};

/** Fixed wording for a server status; a status this client does not know gets the generic message. */
export function buddyStatusMessage(status: string): string {
  return Object.prototype.hasOwnProperty.call(MESSAGES, status)
    ? MESSAGES[status as BuddyStatus]
    : MESSAGES.unknown;
}

/** While matching is switched off, a matched-stranger pair cannot send presets; friend pairs always can. */
export function buddyCanSendPresets(b: { isMatch: boolean; matchingEnabled: boolean }): boolean {
  return !b.isMatch || b.matchingEnabled;
}

/** "You 2/3 · Buddy 3/3 this week"; counts above the goal show as the goal. */
export function buddyWeekLine(myCount: number, buddyCount: number, goal: number): string {
  const cap = (n: number) => Math.min(n, goal);
  return `You ${cap(myCount)}/${goal} · Buddy ${cap(buddyCount)}/${goal} this week`;
}

/** The study buddy card's fixed wording, identical on iOS and Android (pinned by buddy.fixtures.json "copy"). */
export const BUDDY_COPY = {
  intro:
    "Pick a friend to study with. Each week you both aim for 3 lessons and keep a streak together.",
  loadFailed: "Couldn't load your study buddy.",
  poolIntro:
    "Or let us find one: we'll pair you with another learner of the same course at a similar level. You'll see each other's name and weekly progress, and can only send the preset messages. You can end it, block or report at any time.",
  stopLooking: "Stop looking",
  matchedLabel: "Matched learner",
  ageConfirm: "I'm 13 or older",
} as const;

const COURSE_NAMES: Record<string, string> = { en: "English", fr: "French", es: "Spanish" };

/** "French" for "fr"; an unknown code is shown as-is. */
export function buddyCourseName(course: string): string {
  return COURSE_NAMES[course] ?? course;
}

export function buddyFindButton(course: string): string {
  return `Find me a study buddy (${buddyCourseName(course)})`;
}

export function buddyWaitingLine(course: string): string {
  return `Looking for a study buddy learning ${buddyCourseName(course)} at your level.`;
}

export function buddyStreakLine(weeks: number): string {
  return `Streak: ${weeks} week${weeks === 1 ? "" : "s"}`;
}

export function buddyGraceLine(available: boolean): string {
  return available ? "1 grace week left" : "No grace week left";
}

export function buddyIncomingLine(name: string): string {
  return `${name} wants to be your study buddy.`;
}

export function buddyOutgoingLine(name: string): string {
  return `Waiting for ${name}.`;
}

export function buddyEndConfirm(name: string): string {
  return `End being study buddies with ${name}? Your streak ends.`;
}

export function buddyBlockConfirm(name: string): string {
  return `Block ${name}? Your study buddy pairing ends and you won't be matched again.`;
}
export function buddyBlockedLine(name: string): string {
  return `You blocked ${name}. Your study buddy pairing has ended.`;
}
export function buddySafetyMenuLabel(name: string): string {
  return `Block or report ${name}`;
}

/** Most preset messages one buddy may send per hour. Must equal the limit in 20261007100000_buddy_messages.sql. */
export const BUDDY_MESSAGES_PER_HOUR = 20;

/**
 * The only things buddies can say to each other: fixed encouragements, never free text (owner decision 2026-10-06:
 * free text would change the App Store submission). The server stores and checks only the id.
 */
export const BUDDY_PRESETS: readonly { id: string; text: string }[] = [
  { id: "lets_study", text: "Let's study together!" },
  { id: "nice_work", text: "Nice work!" },
  { id: "keep_going", text: "Keep going, you've got this!" },
  { id: "need_a_hand", text: "Need a hand?" },
  { id: "on_my_way", text: "On my way to a lesson!" },
  { id: "good_morning", text: "Good morning!" },
  { id: "good_night", text: "Good night!" },
  { id: "proud_of_you", text: "Proud of you!" },
];

/** The preset's text, or null for an id this client does not know (the card skips that message). */
export function buddyPresetText(id: string): string | null {
  return BUDDY_PRESETS.find((p) => p.id === id)?.text ?? null;
}

/** "You: Nice work!" / "Bo: Nice work!", or null for an unknown preset. */
export function buddyMessageLine(
  isMine: boolean,
  buddyName: string,
  presetId: string,
): string | null {
  const text = buddyPresetText(presetId);
  return text === null ? null : `${isMine ? "You" : buddyName}: ${text}`;
}
