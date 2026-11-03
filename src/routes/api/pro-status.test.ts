import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { auth: { getUser } } }));

const revenueCatConfigFromEnv = vi.fn();
const getSubscriberSummary = vi.fn();
vi.mock("@/lib/revenuecat-entitlement", () => ({ revenueCatConfigFromEnv, getSubscriberSummary }));

const { Route } = await import("./pro-status");
const handler = (
  Route.options.server!.handlers as unknown as {
    GET: (opts: { request: Request }) => Promise<Response>;
  }
).GET;

function req(authorization: string | null = "Bearer token-123") {
  return new Request("https://example.com/api/pro-status", {
    headers: authorization ? { Authorization: authorization } : {},
  });
}

beforeEach(() => {
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  revenueCatConfigFromEnv.mockReset();
  revenueCatConfigFromEnv.mockReturnValue({ secretApiKey: "sk_test" });
  getSubscriberSummary.mockReset();
});

describe("GET /api/pro-status", () => {
  it("401 without a session, and RevenueCat is never asked", async () => {
    const res = await handler({ request: req(null) });
    expect(res.status).toBe(401);
    expect(getSubscriberSummary).not.toHaveBeenCalled();
  });

  it("401 when the session token is not valid", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad" } });
    expect((await handler({ request: req() })).status).toBe(401);
  });

  it("503 entitlement-unavailable when RevenueCat is not configured (fails closed, never 'free')", async () => {
    revenueCatConfigFromEnv.mockReturnValue(null);
    const res = await handler({ request: req() });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "entitlement-unavailable" });
  });

  it("503 entitlement-unavailable when RevenueCat cannot be read", async () => {
    getSubscriberSummary.mockResolvedValue({ status: "unavailable" });
    const res = await handler({ request: req() });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "entitlement-unavailable" });
  });

  it("200 with Pro, store, trial eligibility and the web management link, for the signed-in user only", async () => {
    getSubscriberSummary.mockResolvedValue({
      status: "active",
      store: "web",
      trialEligible: false,
      managementUrl: "https://billing.example/portal",
    });
    const res = await handler({ request: req() });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      pro: true,
      store: "web",
      trialEligible: false,
      manageUrl: "https://billing.example/portal",
    });
    expect(getSubscriberSummary.mock.calls[0][1]).toBe("user-1");
  });

  it("200 pro false for an inactive learner", async () => {
    getSubscriberSummary.mockResolvedValue({
      status: "inactive",
      store: null,
      trialEligible: true,
      managementUrl: null,
    });
    expect(await (await handler({ request: req() })).json()).toEqual({
      pro: false,
      store: null,
      trialEligible: true,
      manageUrl: null,
    });
  });
});
