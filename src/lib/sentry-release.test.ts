// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const init = vi.fn();
vi.mock("@sentry/react", () => ({
  init,
  captureException: vi.fn(),
  breadcrumbsIntegration: vi.fn(() => ({ name: "Breadcrumbs" })),
  makeFetchTransport: vi.fn(() => ({ send: vi.fn(), flush: vi.fn() })),
}));

const originalSha = process.env.VERCEL_GIT_COMMIT_SHA;
beforeEach(() => {
  vi.resetModules();
  init.mockReset();
  delete process.env.VERCEL_GIT_COMMIT_SHA;
});
afterEach(() => {
  vi.unstubAllEnvs();
  if (originalSha === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
  else process.env.VERCEL_GIT_COMMIT_SHA = originalSha;
});

describe("Sentry release", () => {
  it("browser events carry the build's commit SHA as the release", async () => {
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_VERCEL_ENV", "production");
    vi.stubEnv("VITE_SENTRY_RELEASE", "abc123");
    const { initSentryClient } = await import("./sentry-client");
    expect(initSentryClient()).toBe(true);
    expect(init.mock.calls[0][0].release).toBe("abc123");
  });

  it("browser release is left unset (not an empty string) when the build has no SHA", async () => {
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_VERCEL_ENV", "production");
    vi.stubEnv("VITE_SENTRY_RELEASE", "");
    const { initSentryClient } = await import("./sentry-client");
    initSentryClient();
    expect(init.mock.calls[0][0].release).toBeUndefined();
  });

  it("server events use VERCEL_GIT_COMMIT_SHA, falling back to the build-time copy", async () => {
    const { buildServerEvent } = await import("./sentry-server");
    vi.stubEnv("VITE_SENTRY_RELEASE", "");
    expect("release" in buildServerEvent(new Error("x"))).toBe(false);
    vi.stubEnv("VITE_SENTRY_RELEASE", "build-sha");
    expect(buildServerEvent(new Error("x"))).toMatchObject({ release: "build-sha" });
    process.env.VERCEL_GIT_COMMIT_SHA = "runtime-sha";
    expect(buildServerEvent(new Error("x"))).toMatchObject({ release: "runtime-sha" });
  });
});
