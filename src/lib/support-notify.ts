import { staffFirstName } from "./support-staff-name";
import { staffLabel } from "./support-view";

/**
 * The pure rules of "tell the learner when a person replies" and "how long a support chat is kept". The database holds
 * the same rules (migration 20261117100300: the trigger support_queue_staff_reply and support_purge_old); the migration
 * test pins the numbers there to the ones here, so a change in one without the other fails. Safe for the browser and
 * the server.
 *
 * Nothing here ever receives a message body: the notice is built from a person's label alone.
 */

/** A notice goes out at most once per conversation in this window (a burst of replies is one notice). */
export const NOTIFY_BATCH_MINUTES = 30;
/** The sweep retries a notice that was not delivered after this long. */
export const NOTIFY_RETRY_AFTER_MINUTES = 10;
/** The sweep stops retrying after this long. */
export const NOTIFY_GIVE_UP_HOURS = 24;
/** At most this many emails a project-wide hour (the project's mail cap is 30 an hour; replies stay under it). */
export const NOTIFY_EMAILS_PER_HOUR = 30;
/** A solved conversation is deleted this many months after it was solved. */
export const SUPPORT_RETENTION_MONTHS = 12;
/** The owner hears about new tickets at most this often (the sweep's own cadence). */
export const DIGEST_EVERY_MINUTES = 15;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export type MessageKind = "learner" | "ai" | "staff" | "system";

/** The one pending-or-recent notice a conversation may have, as the trigger sees it. */
export type QueueFacts = {
  /** A job for this conversation that was neither delivered nor given up. */
  hasPending: boolean;
  /** When the newest delivered job for this conversation was delivered, or null. */
  lastDeliveredAt: Date | null;
};

/**
 * Whether a new message queues a notice. Only a person's reply does: the AI, the learner and the system lines never
 * notify (an AI answer is read in the open chat, and the hand-off line is not news). Mirrors the SQL trigger.
 */
export function shouldQueueNotice(kind: MessageKind, facts: QueueFacts, now: Date): boolean {
  if (kind !== "staff") return false;
  if (facts.hasPending) return false;
  if (
    facts.lastDeliveredAt &&
    now.getTime() - facts.lastDeliveredAt.getTime() < NOTIFY_BATCH_MINUTES * MINUTE
  ) {
    return false;
  }
  return true;
}

export type QueueRowState = {
  queuedAt: Date;
  deliveredAt: Date | null;
  gaveUpAt: Date | null;
};

/** What the sweep does with a row: `wait` (the route may still be sending it), `retry`, `give_up`, or `skip` (done). */
export function sweepDecision(
  row: QueueRowState,
  now: Date,
): "wait" | "retry" | "give_up" | "skip" {
  if (row.deliveredAt || row.gaveUpAt) return "skip";
  const age = now.getTime() - row.queuedAt.getTime();
  if (age >= NOTIFY_GIVE_UP_HOURS * HOUR) return "give_up";
  if (age >= NOTIFY_RETRY_AFTER_MINUTES * MINUTE) return "retry";
  return "wait";
}

/** Whether another email may go out given how many went out in the last hour. */
export function emailBudgetLeft(sentInLastHour: number): boolean {
  return sentInLastHour < NOTIFY_EMAILS_PER_HOUR;
}

/**
 * The person's label exactly as the chat draws it: "<first name> · Support team", or "Support team" when there is no
 * usable first name. Never Miya (she is the AI helper), never a surname, an email or an id.
 */
export function notifyLabel(
  displayName: string | null | undefined,
  email: string | null | undefined,
): string {
  return staffLabel(staffFirstName(displayName, email));
}

export type ReplyNotice = {
  email: { subject: string; text: string };
  push: { title: string; body: string; data: { type: "support" } };
};

/**
 * The email and the push for one person's reply. No message text, ever: a lock screen is public and an email can be
 * forwarded. The label is the only variable part.
 */
export function buildReplyNotice(label: string): ReplyNotice {
  return {
    email: {
      subject: `You have a reply from ${label}`,
      text: [
        `You have a reply from ${label}.`,
        "Open Learn With Alphonso and go to Help to read it.",
        "",
        "Replying to this email will not reach us.",
      ].join("\n"),
    },
    push: { title: label, body: "You have a reply in Help", data: { type: "support" } },
  };
}

/** The owner's note about new tickets: a count and nothing the learner wrote. */
export function buildTicketDigest(count: number): { subject: string; text: string } | null {
  if (!Number.isInteger(count) || count < 1) return null;
  const noun = count === 1 ? "1 new support ticket" : `${count} new support tickets`;
  return {
    subject: `[Alphonso] ${noun}`,
    text: [
      `${noun} waiting.`,
      "",
      "Open the admin app's Support page to read and answer them.",
    ].join("\n"),
  };
}

/** Whether the owner's digest may go now: one at most per window, measured from the last digest. */
export function digestDue(lastDigestAt: Date | null, now: Date): boolean {
  return !lastDigestAt || now.getTime() - lastDigestAt.getTime() >= DIGEST_EVERY_MINUTES * MINUTE;
}

/** `date` minus whole calendar months, in UTC (the database's `now() - interval '12 months'`). */
export function monthsBefore(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/** A solved conversation older than this is deleted. */
export function supportRetentionCutoff(now: Date): Date {
  return monthsBefore(now, SUPPORT_RETENTION_MONTHS);
}

export type RetentionFacts = { status: string; solvedAt: Date | null };

/**
 * Whether the retention job deletes a conversation: only a SOLVED one, and only when it was solved before the cut-off.
 * A conversation that is open, waiting or still with the AI is never deleted by age, and neither is a solved one with
 * no solved-at time.
 */
export function isPurgeable(conversation: RetentionFacts, now: Date): boolean {
  if (conversation.status !== "solved" || !conversation.solvedAt) return false;
  return conversation.solvedAt.getTime() < supportRetentionCutoff(now).getTime();
}
