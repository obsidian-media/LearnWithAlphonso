import { SUPPORT_COPY } from "./support-copy";
import type { SupportMessage, SupportStatus } from "./support-client";

/**
 * What the Help chat shows for each state, as pure functions (support-view.test.ts). The status words map the way the
 * round 12 mock draws them: `new` and `open` read "With our team", `waiting_learner` reads "Waiting for your reply",
 * `solved` reads "Solved". The status is the server's; nothing here decides anything about the learner's account.
 */

export const POLL_INTERVAL_MS = 20_000;

export type BannerKind = "ai" | "person" | "declined" | "team" | "wait" | "done" | "offline" | null;

export function bannerFor(input: {
  /** Null while the first load has not finished or failed: no banner then. */
  status: SupportStatus | null;
  aiAvailable: boolean;
  /** The learner turned AI features off in Settings. */
  aiDeclined: boolean;
  online: boolean;
}): BannerKind {
  if (!input.online) return "offline";
  switch (input.status) {
    case null:
      return null;
    case "new":
    case "open":
      return "team";
    case "waiting_learner":
      return "wait";
    case "solved":
      return "done";
    case "none":
    case "ai":
      if (!input.aiAvailable) return "person";
      return input.aiDeclined ? "declined" : "ai";
  }
}

export const BANNER_COPY: Record<Exclude<BannerKind, null>, { title: string; body: string }> = {
  ai: { title: SUPPORT_COPY.aiModeTitle, body: SUPPORT_COPY.aiModeBody },
  person: { title: SUPPORT_COPY.personModeTitle, body: SUPPORT_COPY.personModeBody },
  declined: { title: SUPPORT_COPY.declinedTitle, body: SUPPORT_COPY.declinedBody },
  team: { title: SUPPORT_COPY.teamTitle, body: SUPPORT_COPY.teamBody },
  wait: { title: SUPPORT_COPY.waitTitle, body: SUPPORT_COPY.waitBody },
  done: { title: SUPPORT_COPY.solvedTitle, body: SUPPORT_COPY.solvedBody },
  offline: { title: SUPPORT_COPY.offlineTitle, body: SUPPORT_COPY.offlineBody },
};

export type SendLimit = "daily" | "conversation" | null;

export function composerFor(input: {
  status: SupportStatus | null;
  limit: SendLimit;
  online: boolean;
  /** The first-open screen with AI answers on shows the longer "answers can be wrong" note. */
  aiFirstOpen: boolean;
}): { placeholder: string; fine: string; disabled: boolean } {
  if (input.limit === "daily")
    return {
      placeholder: SUPPORT_COPY.placeholderLimit,
      fine: SUPPORT_COPY.fineLimit,
      disabled: true,
    };
  if (input.limit === "conversation")
    return { placeholder: SUPPORT_COPY.placeholderFull, fine: "", disabled: true };
  const fine = !input.online
    ? SUPPORT_COPY.fineOffline
    : input.status === "solved"
      ? SUPPORT_COPY.fineSolved
      : input.aiFirstOpen
        ? SUPPORT_COPY.aiFine
        : SUPPORT_COPY.fine;
  const placeholder =
    input.status === "new" || input.status === "open"
      ? SUPPORT_COPY.placeholderMore
      : input.status === "waiting_learner"
        ? SUPPORT_COPY.placeholderReply
        : input.status === "solved"
          ? SUPPORT_COPY.placeholderSolved
          : SUPPORT_COPY.placeholder;
  return { placeholder, fine, disabled: false };
}

/** The conversation is polled while it is open and the AI is not the one answering. */
export function shouldPoll(status: SupportStatus | null): boolean {
  return status !== null && status !== "ai";
}

/** The id of the first unread person reply, where the "New reply" divider goes; null when nothing is unread. */
export function unreadDividerId(
  messages: readonly SupportMessage[],
  unread: number,
): number | null {
  if (unread <= 0) return null;
  const staff = messages.filter((m) => m.kind === "support");
  if (staff.length === 0) return null;
  return staff.slice(-unread)[0]!.id;
}

const LOCALE = "en-US";

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** "Today", "Yesterday", or "14 Nov". */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (sameDay(d, now)) return SUPPORT_COPY.today;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return SUPPORT_COPY.yesterday;
  return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short" }).format(d);
}

/** "9:41 AM" today; "Mon 11:12 AM" within the last six days; "14 Nov, 10:02 AM" before that. */
export function timeLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const clock = new Intl.DateTimeFormat(LOCALE, { hour: "numeric", minute: "2-digit" }).format(d);
  if (sameDay(d, now)) return clock;
  const ageDays = (now.getTime() - d.getTime()) / 86_400_000;
  if (ageDays >= 0 && ageDays < 6) {
    return `${new Intl.DateTimeFormat(LOCALE, { weekday: "short" }).format(d)} ${clock}`;
  }
  return `${new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short" }).format(d)}, ${clock}`;
}

/** A calendar-day key, to put a divider where the day changes. */
export const dayKey = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
