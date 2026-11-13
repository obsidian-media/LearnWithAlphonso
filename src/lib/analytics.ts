import { UNDER_13_KEY } from "./first-run";
import { POSTHOG_HOST } from "./analytics-config";
import { sanitizeEventProps, type AnalyticsEvent } from "./analytics-events";

/**
 * Optional usage analytics (PostHog), strictly opt-in.
 * - Nothing is loaded or sent until the learner says yes (cookie banner Accept all, or the Settings switch).
 * - Off again at once on opt-out, and the anonymous id is reset.
 * - Never on an Under 13 device.
 * - Anonymous only: identify() is never called, so there is no email, name or account id. No autocapture, no
 *   session recording, no surveys, no page-view capture.
 */
export const ANALYTICS_CONSENT_KEY = "lwa.analytics-consent.v1";

export type AnalyticsClient = {
  capture(event: string, props: Record<string, unknown>): void;
  reset(): void;
};

let client: AnalyticsClient | null = null;
let loading: Promise<AnalyticsClient | null> | null = null;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function under13(): boolean {
  try {
    return storage()?.getItem(UNDER_13_KEY) === "1";
  } catch {
    return false;
  }
}

/** True only for an explicit opt-in on a device that is not Under 13. */
export function analyticsConsent(): boolean {
  if (under13()) return false;
  try {
    return storage()?.getItem(ANALYTICS_CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAnalyticsConsent(on: boolean): void {
  try {
    storage()?.setItem(ANALYTICS_CONSENT_KEY, on ? "1" : "0");
  } catch {
    // Storage blocked: consent stays off, which is the safe side.
  }
  if (!on) client?.reset();
}

const projectKey = (): string | undefined =>
  (import.meta.env.VITE_POSTHOG_KEY as string | undefined)?.trim() || undefined;

let loaderOverride: (() => Promise<AnalyticsClient | null>) | null = null;

async function load(): Promise<AnalyticsClient | null> {
  if (client) return client;
  if (loaderOverride) return loaderOverride();
  const key = projectKey();
  if (!key || typeof window === "undefined") return null;
  loading ??= import("posthog-js").then(({ default: posthog }) => {
    posthog.init(key, {
      api_host: POSTHOG_HOST,
      persistence: "localStorage",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      disable_surveys: true,
      advanced_disable_flags: true,
      person_profiles: "identified_only",
      respect_dnt: true,
    });
    client = posthog;
    return client;
  });
  return loading.catch(() => null);
}

/** Sends one event if, and only if, the learner opted in. Never throws. */
export async function track(
  event: AnalyticsEvent,
  props: Record<string, unknown> = {},
): Promise<void> {
  try {
    if (!analyticsConsent()) return;
    const sdk = client ?? (await load());
    // Re-check after the load: the learner may have opted out while the SDK was arriving.
    if (!sdk || !analyticsConsent()) return;
    sdk.capture(event, { ...sanitizeEventProps(event, props), platform: "web" });
  } catch {
    // Analytics must never break the app.
  }
}

export function __setAnalyticsClientForTests(next: AnalyticsClient | null): void {
  client = next;
}

export function __setAnalyticsLoaderForTests(
  next: (() => Promise<AnalyticsClient | null>) | null,
): void {
  loaderOverride = next;
}

export function __resetAnalyticsForTests(): void {
  loaderOverride = null;
  client = null;
  loading = null;
}
