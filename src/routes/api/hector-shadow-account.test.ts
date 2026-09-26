import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { auth: { getUser } },
}));

const revenueCatConfigFromEnv = vi.fn();
const isProSubscriber = vi.fn();
vi.mock("@/lib/revenuecat-entitlement", () => ({ revenueCatConfigFromEnv, isProSubscriber }));

const hectorShadowAccountConfigFromEnv = vi.fn();
const provisionShadowAccount = vi.fn();
vi.mock("@/lib/hector-shadow-account", () => ({
  hectorShadowAccountConfigFromEnv,
  provisionShadowAccount,
}));

const { Route } = await import("./hector-shadow-account");
const handler = (
  Route.options.server!.handlers as unknown as {
    POST: (opts: { request: Request }) => Promise<Response>;
  }
).POST;

function req(authorization = "Bearer token-123") {
  return new Request("https://example.com/api/hector-shadow-account", {
    method: "POST",
    headers: authorization ? { Authorization: authorization } : undefined,
  });
}

beforeEach(() => {
  getUser.mockReset();
  revenueCatConfigFromEnv.mockReset();
  isProSubscriber.mockReset();
  hectorShadowAccountConfigFromEnv.mockReset();
  provisionShadowAccount.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
});

describe("POST /api/hector-shadow-account", () => {
  it("rejects a request with no Authorization header", async () => {
    const res = await handler({ request: req("") });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ available: false, reason: "unauthorized" });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("rejects an invalid or expired access token", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error("invalid") });
    const res = await handler({ request: req() });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ available: false, reason: "unauthorized" });
  });

  it("fails closed (403) when RevenueCat isn't configured, rather than letting the caller through", async () => {
    revenueCatConfigFromEnv.mockReturnValue(null);
    const res = await handler({ request: req() });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ available: false, reason: "entitlement-check-unavailable" });
    expect(isProSubscriber).not.toHaveBeenCalled();
  });

  it("refuses a non-Pro subscriber with 403 -- the authorization gate itself", async () => {
    revenueCatConfigFromEnv.mockReturnValue({ secretApiKey: "sk_test" });
    isProSubscriber.mockResolvedValue(false);
    const res = await handler({ request: req() });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ available: false, reason: "not-entitled" });
    expect(isProSubscriber).toHaveBeenCalledWith({ secretApiKey: "sk_test" }, "user-1");
    expect(hectorShadowAccountConfigFromEnv).not.toHaveBeenCalled();
  });

  it("reports not-configured (200, not an error) for a confirmed Pro subscriber when Cloud Voice's endpoint isn't set up yet", async () => {
    revenueCatConfigFromEnv.mockReturnValue({ secretApiKey: "sk_test" });
    isProSubscriber.mockResolvedValue(true);
    hectorShadowAccountConfigFromEnv.mockReturnValue(null);

    const res = await handler({ request: req() });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: false, reason: "not-configured" });
    expect(provisionShadowAccount).not.toHaveBeenCalled();
  });

  it("reports shadow-account-unavailable when Cloud Voice refuses to provision", async () => {
    revenueCatConfigFromEnv.mockReturnValue({ secretApiKey: "sk_test" });
    isProSubscriber.mockResolvedValue(true);
    hectorShadowAccountConfigFromEnv.mockReturnValue({
      linkAccountUrl: "https://x",
      sharedSecret: "shh",
    });
    provisionShadowAccount.mockResolvedValue(null);

    const res = await handler({ request: req() });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: false, reason: "shadow-account-unavailable" });
  });

  it("returns the shadow session for a confirmed Pro subscriber once Cloud Voice provisions one", async () => {
    revenueCatConfigFromEnv.mockReturnValue({ secretApiKey: "sk_test" });
    isProSubscriber.mockResolvedValue(true);
    hectorShadowAccountConfigFromEnv.mockReturnValue({
      linkAccountUrl: "https://x",
      sharedSecret: "shh",
    });
    provisionShadowAccount.mockResolvedValue({
      cloudVoiceUserId: "cv-1",
      accessToken: "at",
      refreshToken: "rt",
    });

    const res = await handler({ request: req() });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      available: true,
      cloudVoiceUserId: "cv-1",
      accessToken: "at",
      refreshToken: "rt",
    });
    expect(provisionShadowAccount).toHaveBeenCalledWith(
      { linkAccountUrl: "https://x", sharedSecret: "shh" },
      "user-1",
    );
  });
});
