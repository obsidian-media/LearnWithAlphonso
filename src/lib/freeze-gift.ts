/**
 * Gift a streak freeze, the web side. The rules live in the database (20261120130000_gift_streak_freeze.sql:
 * a transfer of a freeze the sender holds, one per friend per UTC day, refused when the friend already holds 3).
 * This file only turns the database's answer into words and decides what the button looks like; the page never
 * decides whether a gift is allowed, it only avoids offering one it already knows will be refused.
 */
export type GiftFreezeReason =
  "unauthenticated" | "not-friends" | "already-gifted-today" | "no-freeze" | "recipient-full";

export type GiftFreezeResult =
  | { ok: true; freezes: number }
  | { ok: false; reason: GiftFreezeReason | "error"; freezes: number | null };

const KNOWN: readonly string[] = [
  "unauthenticated",
  "not-friends",
  "already-gifted-today",
  "no-freeze",
  "recipient-full",
];

/** Anything the database says that is not a known reason reads as a plain error (never shown as a made-up reason). */
export function giftFreezeReason(raw: string | null | undefined): GiftFreezeReason | "error" {
  return raw && KNOWN.includes(raw) ? (raw as GiftFreezeReason) : "error";
}

export function giftFreezeMessage(result: GiftFreezeResult, friendName: string): string {
  if (result.ok) return `Freeze sent to ${friendName}.`;
  switch (result.reason) {
    case "recipient-full":
      return `${friendName} already has all the freezes they can hold.`;
    case "already-gifted-today":
      return `You already gifted ${friendName} a freeze today. Try again tomorrow.`;
    case "no-freeze":
      return "You have no streak freeze to give.";
    case "not-friends":
      return `Couldn't send a freeze to ${friendName}.`;
    default:
      return `Couldn't send a freeze to ${friendName}. Try again.`;
  }
}

export type GiftButtonState = "send" | "sent-today" | "no-freeze";

/** What the row's gift button shows, from what the page has loaded (the database still has the last word). */
export function giftButtonState(
  myFreezes: number | null | undefined,
  giftedTodayTo: ReadonlySet<string>,
  friendId: string,
): GiftButtonState {
  if (giftedTodayTo.has(friendId)) return "sent-today";
  if (myFreezes !== null && myFreezes !== undefined && myFreezes < 1) return "no-freeze";
  return "send";
}

/** The accessible name of the row's gift button: says what it does, or why it is off. */
export function giftAriaLabel(friendName: string, state: GiftButtonState): string {
  if (state === "sent-today") return `Streak freeze already sent to ${friendName} today`;
  if (state === "no-freeze") return `Gift a streak freeze to ${friendName} (you have none to give)`;
  return `Gift a streak freeze to ${friendName}`;
}

/** The toast for freezes received: one friend by name, several by count. */
export function freezeReceivedToast(senderNames: string[]): string {
  return senderNames.length === 1
    ? `${senderNames[0]} gifted you a streak freeze!`
    : `${senderNames.length} friends gifted you a streak freeze!`;
}
