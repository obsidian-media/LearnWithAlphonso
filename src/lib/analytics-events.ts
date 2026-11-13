/**
 * The whole analytics vocabulary, in one place. iOS (AnalyticsEvents.swift) and Android (AnalyticsEvents.kt)
 * carry the same list; src/lib/analytics-parity.test.ts fails if the three drift.
 *
 * Privacy by construction: an event may carry only the properties listed here, and a value is kept only if it
 * looks like a short identifier (content ids, level codes, source names) or a small number. Anything else, an
 * email, a typed answer, a chat line, is dropped before it reaches the SDK. Never add a free-text property.
 */
export const ANALYTICS_EVENTS = [
  "app_open",
  "onboarding_step",
  "sign_in_completed",
  "lesson_started",
  "lesson_completed",
  "practice_call_started",
  "practice_call_completed",
  "podcast_played",
  "podcast_completed",
  "hector_opened",
  "paywall_viewed",
  "purchase_started",
  "explain_requested",
  "path_built",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

type Kind = "id" | "number";

export const ANALYTICS_PROPS: Record<AnalyticsEvent, Record<string, Kind>> = {
  app_open: {},
  onboarding_step: { step: "id" },
  sign_in_completed: { method: "id" },
  lesson_started: { lesson_id: "id", level: "id", course: "id" },
  lesson_completed: { lesson_id: "id", level: "id", course: "id", score_bucket: "id" },
  practice_call_started: { scenario_id: "id" },
  practice_call_completed: { scenario_id: "id", stars: "number" },
  podcast_played: { episode_id: "id", course: "id" },
  podcast_completed: { episode_id: "id", course: "id" },
  hector_opened: {},
  paywall_viewed: { source: "id" },
  purchase_started: { source: "id" },
  explain_requested: { source: "id" },
  path_built: { course: "id" },
};

/** A short identifier: letters, digits and _ . : + - only. No spaces and no at sign, so no sentence and no email. */
const ID_VALUE = /^[A-Za-z0-9_.:+-]{1,64}$/;

/** 0-49, 50-79, 80-99 or 100: a bucket, never the raw score. */
export function scoreBucket(percent: number): string {
  if (!Number.isFinite(percent)) return "0-49";
  if (percent >= 100) return "100";
  if (percent >= 80) return "80-99";
  if (percent >= 50) return "50-79";
  return "0-49";
}

export function sanitizeEventProps(
  event: AnalyticsEvent,
  props: Record<string, unknown>,
): Record<string, string | number> {
  const allowed = ANALYTICS_PROPS[event];
  const out: Record<string, string | number> = {};
  for (const [key, kind] of Object.entries(allowed)) {
    const value = props[key];
    if (kind === "id" && typeof value === "string" && ID_VALUE.test(value)) out[key] = value;
    if (
      kind === "number" &&
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 100
    ) {
      out[key] = value;
    }
  }
  return out;
}
