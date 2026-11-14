/**
 * The words the staff inbox shows, as pure functions (support-inbox-copy.test.ts). Status, topic, channel and
 * hand-off reason are enums stored by the server; nothing here reads learner text.
 */

export const STATUS_LABELS: Record<string, string> = {
  new: "New",
  open: "Open",
  waiting_learner: "Waiting on learner",
  solved: "Solved",
};

export const TOPIC_LABELS: Record<string, string> = {
  billing: "Billing",
  pro: "Pro",
  restore: "Restore",
  streak: "Streak",
  league: "League",
  account: "Account",
  privacy: "Privacy",
  bug: "Bug",
  other: "Other",
};

export const CHANNEL_LABELS: Record<string, string> = {
  web: "Web",
  ios: "iOS",
  android: "Android",
};

/** Why the chat came to a person. AI off at launch reads "AI was off". */
export const HANDOFF_LABELS: Record<string, string> = {
  learner_asked: "Learner asked for a person",
  ai_unsure: "AI was unsure",
  sensitive_topic: "Sensitive topic",
  ai_unavailable: "AI was off",
  quota: "AI limit reached",
  ai_error: "AI error",
};

export const label = (map: Record<string, string>, key: string | null | undefined, fallback = "") =>
  (key ? map[key] : undefined) ?? fallback;

export const FILTERS = [
  { key: "open", label: "Open" },
  { key: "waiting", label: "Waiting on learner" },
  { key: "solved", label: "Solved" },
  { key: "all", label: "All" },
] as const;

const COURSE_NAMES: Record<string, string> = { en: "English", fr: "French", es: "Spanish" };
export const courseName = (code: string | null) => (code ? (COURSE_NAMES[code] ?? code) : null);

/** "12 min ago", "2 h ago", "Yesterday", then the short date. `now` is injectable for tests. */
export function ageLabel(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.round((now - then) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor((now - then) / 86_400_000);
  if (days === 1) return "Yesterday";
  return new Date(then).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** "14 Nov, 10:02" for a conversation line. */
export function stampLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
}

export const ticketTitle = (topic: string | null) => label(TOPIC_LABELS, topic, "Support ticket");

/** Who a ticket belongs to, in the list: "Unassigned", "You", or the staff member's name. */
export function assigneeLabel(
  ticket: { assignedTo: string | null; assignedName: string | null },
  me: string,
): string {
  if (!ticket.assignedTo) return "Unassigned";
  if (ticket.assignedTo === me) return "You";
  return ticket.assignedName?.trim() || "Another staff member";
}
