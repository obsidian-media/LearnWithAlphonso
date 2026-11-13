import { beforeEach, describe, expect, it, vi } from "vitest";
import { ANALYTICS_EVENTS, sanitizeEventProps } from "./analytics-events";
import {
  ANALYTICS_CONSENT_KEY,
  analyticsConsent,
  setAnalyticsConsent,
  track,
  __resetAnalyticsForTests,
  __setAnalyticsClientForTests,
  __setAnalyticsLoaderForTests,
  type AnalyticsClient,
} from "./analytics";
import { UNDER_13_KEY } from "./first-run";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

function fakeClient() {
  return {
    capture: vi.fn<(event: string, props: Record<string, unknown>) => void>(),
    reset: vi.fn<() => void>(),
  } satisfies AnalyticsClient;
}

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: memoryStorage() });
  __resetAnalyticsForTests();
});

describe("consent gating", () => {
  it("sends nothing before the learner opts in", async () => {
    const client = fakeClient();
    __setAnalyticsClientForTests(client);
    expect(analyticsConsent()).toBe(false);
    await track("app_open", {});
    expect(client.capture).not.toHaveBeenCalled();
  });

  it("does not even load the SDK before the learner opts in", async () => {
    const loader = vi.fn(async () => fakeClient());
    __setAnalyticsLoaderForTests(loader);
    await track("app_open", {});
    expect(loader).not.toHaveBeenCalled();
  });

  it("drops an event if the learner opts out while the SDK is still loading", async () => {
    const client = fakeClient();
    __setAnalyticsLoaderForTests(async () => {
      setAnalyticsConsent(false);
      return client;
    });
    setAnalyticsConsent(true);
    await track("app_open", {});
    expect(client.capture).not.toHaveBeenCalled();
  });

  it("sends after opt-in", async () => {
    const client = fakeClient();
    __setAnalyticsClientForTests(client);
    setAnalyticsConsent(true);
    await track("lesson_started", { lesson_id: "l-1", level: "A1", course: "english" });
    expect(client.capture).toHaveBeenCalledWith("lesson_started", {
      lesson_id: "l-1",
      level: "A1",
      course: "english",
      platform: "web",
    });
  });

  it("stops sending and resets the distinct id after opt-out", async () => {
    const client = fakeClient();
    __setAnalyticsClientForTests(client);
    setAnalyticsConsent(true);
    setAnalyticsConsent(false);
    expect(client.reset).toHaveBeenCalledTimes(1);
    await track("app_open", {});
    expect(client.capture).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe("0");
  });

  it("never sends on an under-13 device even with a stored opt-in", async () => {
    const client = fakeClient();
    __setAnalyticsClientForTests(client);
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "1");
    window.localStorage.setItem(UNDER_13_KEY, "1");
    await track("app_open", {});
    expect(client.capture).not.toHaveBeenCalled();
    expect(analyticsConsent()).toBe(false);
  });
});

describe("no PII in payloads", () => {
  it("drops email-like, free-text and unknown fields", () => {
    const clean = sanitizeEventProps("lesson_completed", {
      lesson_id: "l-1",
      level: "A1",
      course: "english",
      score_bucket: "80-99",
      email: "maria@example.com",
      answer: "I would like a coffee please",
      course_note: "maria@example.com",
    });
    expect(clean).toEqual({
      lesson_id: "l-1",
      level: "A1",
      course: "english",
      score_bucket: "80-99",
    });
  });

  it("drops an allowed key when its value is an email or a sentence", () => {
    expect(
      sanitizeEventProps("lesson_started", {
        lesson_id: "maria@example.com",
        level: "hello there friend",
      }),
    ).toEqual({});
    expect(sanitizeEventProps("paywall_viewed", { source: "x".repeat(200) })).toEqual({});
  });

  it("keeps numbers for stars and rejects objects", () => {
    expect(
      sanitizeEventProps("practice_call_completed", { scenario_id: "cafe", stars: 3 }),
    ).toEqual({
      scenario_id: "cafe",
      stars: 3,
    });
    expect(
      sanitizeEventProps("practice_call_completed", { scenario_id: { a: 1 }, stars: "3" }),
    ).toEqual({});
  });

  it("every event name is lowercase snake_case", () => {
    for (const name of ANALYTICS_EVENTS) expect(name).toMatch(/^[a-z]+(_[a-z]+)*$/);
  });
});
