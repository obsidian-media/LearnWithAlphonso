// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SENTRY_INGEST_ORIGIN, SENTRY_WEB_DSN, sentryDsnFor } from "./sentry-config";
import { contentSecurityPolicy } from "./security-policy";

const init = vi.fn();
const captureException = vi.fn();
vi.mock("@sentry/react", () => ({ init, captureException }));

beforeEach(() => {
  vi.resetModules();
  init.mockReset();
  captureException.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sentryDsnFor", () => {
  it("is off outside production, even with an override", () => {
    expect(sentryDsnFor({ production: false })).toBeUndefined();
    expect(
      sentryDsnFor({ production: false, override: "https://k@o1.ingest.sentry.io/1" }),
    ).toBeUndefined();
  });
  it("uses the committed public web DSN in production, or an override", () => {
    expect(sentryDsnFor({ production: true })).toBe(SENTRY_WEB_DSN);
    expect(sentryDsnFor({ production: true, override: "https://k@o1.ingest.sentry.io/1" })).toBe(
      "https://k@o1.ingest.sentry.io/1",
    );
  });
});

describe("browser Sentry init", () => {
  it("does nothing in tests and dev", async () => {
    const { initSentryClient } = await import("./sentry-client");
    expect(initSentryClient()).toBe(false);
    expect(init).not.toHaveBeenCalled();
  });

  it("in production: no PII, no tracing, no replay, scrubbing hooks wired", async () => {
    vi.stubEnv("PROD", true);
    const { initSentryClient } = await import("./sentry-client");
    expect(initSentryClient()).toBe(true);
    const options = init.mock.calls[0][0];
    expect(options.dsn).toBe(SENTRY_WEB_DSN);
    expect(options.sendDefaultPii).toBe(false);
    expect(options.tracesSampleRate).toBe(0);
    expect(options.replaysSessionSampleRate).toBeUndefined();
    expect(options.replaysOnErrorSampleRate).toBeUndefined();
    expect(options.integrations).toBeUndefined();
    const event = options.beforeSend({ message: "x a@b.com", user: { email: "a@b.com" } });
    expect(JSON.stringify(event)).not.toContain("a@b.com");
    expect(options.beforeBreadcrumb({ category: "console" })).toBeNull();
  });

  it("reportError reaches Sentry only after init", async () => {
    vi.stubEnv("PROD", true);
    const { reportError } = await import("./error-reporting");
    const { initSentryClient } = await import("./sentry-client");
    vi.spyOn(console, "error").mockImplementation(() => {});
    reportError(new Error("before"));
    expect(captureException).not.toHaveBeenCalled();
    initSentryClient();
    reportError(new Error("after"), { boundary: "x" });
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});

describe("server reporter", () => {
  it("sends nothing outside production", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    const { reportServerError } = await import("./sentry-server");
    await reportServerError(new Error("boom"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("in production posts a scrubbed envelope to the ingest host", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    const { reportServerError } = await import("./sentry-server");
    await reportServerError(new Error("failed for maria@example.com"), { route: "/api/chat" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, requestInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url.startsWith(`${SENTRY_INGEST_ORIGIN}/api/4512372763328513/envelope/`)).toBe(true);
    expect(String(requestInit.body)).not.toContain("maria@example.com");
    expect(String(requestInit.body)).toContain("[email]");
  });
});

describe("CSP", () => {
  it("allows the Sentry ingest host in connect-src only", () => {
    const policy = contentSecurityPolicy("n", "https://p.supabase.co");
    const connect = policy.split("; ").find((d) => d.startsWith("connect-src"))!;
    expect(connect).toContain(SENTRY_INGEST_ORIGIN);
    expect(policy.split("; ").filter((d) => d.includes("sentry.io"))).toEqual([connect]);
  });
});
