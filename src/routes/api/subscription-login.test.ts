import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { auth: { getUser } } }));

const revenueCatConfigFromEnv = vi.fn();
const getAccountSubscriberSummary = vi.fn();
vi.mock("@/lib/revenuecat-entitlement", () => ({
  revenueCatConfigFromEnv,
  getAccountSubscriberSummary,
}));

const { Route } = await import("./subscription-login");
const handler = (
  Route.options.server!.handlers as unknown as {
    GET: (opts: { request: Request }) => Promise<Response>;
  }
).GET;

const req = (authorization: string | null = "Bearer token-123") =>
  new Request("https://example.com/api/subscription-login", {
    headers: authorization ? { Authorization: authorization } : {},
  });

beforeEach(() => {
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  revenueCatConfigFromEnv.mockReset();
  revenueCatConfigFromEnv.mockReturnValue({
    secretApiKey: "sk",
    subscriptionIdSecret: "s".repeat(40),
  });
  getAccountSubscriberSummary.mockReset();
});

describe("GET /api/subscription-login", () => {
  it("401 without a valid session", async () => {
    expect((await handler({ request: req(null) })).status).toBe(401);
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad" } });
    expect((await handler({ request: req() })).status).toBe(401);
    expect(getAccountSubscriberSummary).not.toHaveBeenCalled();
  });

  it("returns the id the summary chose for the signed-in account", async () => {
    getAccountSubscriberSummary.mockResolvedValue({ status: "inactive", loginId: "sub_abc" });
    const res = await handler({ request: req() });
    expect(await res.json()).toEqual({ appUserId: "sub_abc" });
    expect(getAccountSubscriberSummary.mock.calls[0]![1]).toBe("user-1");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("without the identifier secret (or RevenueCat) the account id is used, as before", async () => {
    revenueCatConfigFromEnv.mockReturnValue({ secretApiKey: "sk" });
    expect(await (await handler({ request: req() })).json()).toEqual({ appUserId: "user-1" });
    revenueCatConfigFromEnv.mockReturnValue(null);
    expect(await (await handler({ request: req() })).json()).toEqual({ appUserId: "user-1" });
    expect(getAccountSubscriberSummary).not.toHaveBeenCalled();
  });

  it("503 when RevenueCat cannot be read (the app then uses the account id, which the server also accepts)", async () => {
    getAccountSubscriberSummary.mockResolvedValue({ status: "unavailable", loginId: null });
    expect((await handler({ request: req() })).status).toBe(503);
  });
});
