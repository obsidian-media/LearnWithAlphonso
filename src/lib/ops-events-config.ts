/**
 * Thresholds for the operational events (20261125140000_ops_events.sql), in ONE place. Used by the System health page
 * (green / amber / red from the 24-hour count) and by the owner alert in the maintenance sweep (the last-hour count).
 *
 *   amberAt / redAt: the 24-hour count at which the page turns amber / red.
 *   alertPerHour:    the last-hour count at which the owner is emailed (at most once per event per 24 hours).
 *
 * An event not listed here (a new emitter nobody configured yet) uses UNLISTED so it is still seen.
 */
export type OpsThreshold = { amberAt: number; redAt: number; alertPerHour: number };

export const OPS_EVENT_THRESHOLDS: Record<string, OpsThreshold> = {
  // A lesson saved but its hearts could not be settled: free misses and a 503 for the app. Never expected.
  hearts_settlement_failed: { amberAt: 1, redAt: 5, alertPerHour: 3 },
  // The first reply could not be stored for the retry path: a retried completion might answer from an older copy.
  lesson_result_finalize_failed: { amberAt: 1, redAt: 5, alertPerHour: 3 },
  // RevenueCat did not answer and no stored answer was usable: hearts were not charged. Noisy during an outage.
  hearts_settlement_shadow_pro_unknown: { amberAt: 10, redAt: 100, alertPerHour: 50 },
  // A publish failed and the draft's public copy could not be removed again: a private draft is publicly reachable.
  // One is already one too many.
  publish_cleanup_failed: { amberAt: 1, redAt: 1, alertPerHour: 1 },
  hearts_settlement_shadow_stale_pro: { amberAt: 10, redAt: 100, alertPerHour: 50 },
};

/**
 * What each event is called for a person. The event NAME is the failure itself (a row is written only when that thing
 * went wrong), so a count of zero is the good state and any count is how many times it happened.
 */
export const OPS_EVENT_LABELS: Record<string, string> = {
  hearts_settlement_failed: "Hearts settlement",
  lesson_result_finalize_failed: "Lesson result saving",
  hearts_settlement_shadow_pro_unknown: "Pro check at settlement",
  publish_cleanup_failed: "Draft left public after a failed publish",
  hearts_settlement_shadow_stale_pro: "Stale Pro answer at settlement",
};

/** A readable label for an event: the table above, else the name with spaces ("some_new_event" to "Some new event"). */
export function opsEventLabel(event: string): string {
  const known = OPS_EVENT_LABELS[event];
  if (known) return known;
  const spaced = event.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export const UNLISTED: OpsThreshold = { amberAt: 1, redAt: 10, alertPerHour: 10 };

/** Events always shown on the page, even with no rows (a green line is information). */
export const KNOWN_OPS_EVENTS = Object.keys(OPS_EVENT_THRESHOLDS);

export const thresholdFor = (event: string): OpsThreshold =>
  OPS_EVENT_THRESHOLDS[event] ?? UNLISTED;

export type OpsStatus = "green" | "amber" | "red";

export function opsStatus(event: string, count24h: number): OpsStatus {
  const t = thresholdFor(event);
  if (count24h >= t.redAt) return "red";
  if (count24h >= t.amberAt) return "amber";
  return "green";
}

/** The minimum gap between two owner emails about the same event. */
export const OPS_ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
