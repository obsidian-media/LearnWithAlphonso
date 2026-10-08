/**
 * Learner-facing copy for a quota-exceeded response. Mirrors the iOS Kit's
 * TutorError.userMessage so both clients say the same thing. Two minutes or
 * less until the reset means the per-minute burst, not the daily cap.
 */
export function quotaExceededMessage(
  resetsAt: string | null,
  now: Date = new Date(),
  timeZone?: string,
): string {
  const reset = resetsAt ? new Date(resetsAt) : null;
  if (!reset || Number.isNaN(reset.getTime())) {
    return "You've reached today's AI practice limit. Try again tomorrow.";
  }
  if (reset.getTime() - now.getTime() <= 120_000) {
    return "Too many requests. Wait a minute and try again.";
  }
  const time = reset
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone })
    // ICU 72+ separates "AM"/"PM" with a narrow no-break space.
    .replace(/ /g, " ");
  return `You've reached today's AI practice limit. It resets at ${time}.`;
}
