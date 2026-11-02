import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { auth: { getUser } } }));

const revenueCatConfigFromEnv = vi.fn();
const getSubscriberSummary = vi.fn();
vi.mock("@/lib/revenuecat-entitlement", () => ({ revenueCatConfigFromEnv, getSubscriberSummary }));

const getWebOffering = vi.fn();
vi.mock("@/lib/web-offering.server", async (orig) => ({
  ...(await orig<typeof import("@/lib/web-offering.server")>()),
  getWebOffering,
}));

const { Route } = await import("./pro-offering");
const handler = (
  Route.options.server!.handlers as unknown as {
    GET: (opts: { request: Request }) => Promise<Response>;
  }
).GET;

function req(source: string | null = "hector_tab", authorization: string | null = "Bearer t") {
  const url = new URL("https://example.com/api/pro-offering");
  if (source !== null) url.searchParams.set("source", source);
  return new Request(url, { headers: authorization ? { Authorization: authorization } : {} });
}

const OFFER = { price: "$9.99", period: "month", trialDays: 7 };

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("REVENUECAT_WEB_PRODUCT_ID", "prod_web");
  vi.stubEnv("REVENUECAT_WEB_PURCHASE_LINK", "https://pay.rev.cat/trial_tok");
  vi.stubEnv("REVENUECAT_WEB_PURCHASE_LINK_NO_TRIAL", "https://pay.rev.cat/plain_tok");
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  revenueCatConfigFromEnv.mockReturnValue({ secretApiKey: "a", v2SecretKey: "b", projectId: "p" });
  getSubscriberSummary.mockReset();
  getSubscriberSummary.mockResolvedValue({
    status: "inactive",
    store: null,
    trialEligible: true,
    managementUrl: null,
  });
  getWebOffering.mockReset();
  getWebOffering.mockResolvedValue(OFFER);
});

describe("GET /api/pro-offering", () => {
  it("401 without a session", async () => {
    expect((await handler({ request: req("hector_tab", null) })).status).toBe(401);
  });

  it.each([null, "somewhere_else"])(
    "400 for a missing or unknown paywall source (%s)",
    async (source) => {
      expect((await handler({ request: req(source) })).status).toBe(400);
    },
  );

  it("a learner who never subscribed gets the trial link, the trial and the price", async () => {
    const res = await handler({ request: req("practice_hector_card") });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      price: "$9.99",
      period: "month",
      trialDays: 7,
      purchaseUrl:
        "https://pay.rev.cat/trial_tok/user-1?metadata%5Bpaywall_source%5D=practice_hector_card",
    });
  });

  it("a learner who already had Pro gets no trial and the no-trial link", async () => {
    getSubscriberSummary.mockResolvedValue({
      status: "inactive",
      store: null,
      trialEligible: false,
      managementUrl: null,
    });
    const body = await (await handler({ request: req() })).json();
    expect(body.trialDays).toBeNull();
    expect(body.purchaseUrl).toMatch(/^https:\/\/pay\.rev\.cat\/plain_tok\/user-1\?/);
  });

  it("without a no-trial link, relies on RevenueCat's own trial rule and still shows no trial", async () => {
    vi.stubEnv("REVENUECAT_WEB_PURCHASE_LINK_NO_TRIAL", "");
    getSubscriberSummary.mockResolvedValue({
      status: "inactive",
      store: null,
      trialEligible: false,
      managementUrl: null,
    });
    const body = await (await handler({ request: req() })).json();
    expect(body.trialDays).toBeNull();
    expect(body.purchaseUrl).toMatch(/^https:\/\/pay\.rev\.cat\/trial_tok\/user-1\?/);
  });

  it.each([
    ["the offering cannot be read", () => getWebOffering.mockResolvedValue(null)],
    [
      "eligibility cannot be read",
      () => getSubscriberSummary.mockResolvedValue({ status: "unavailable" }),
    ],
    ["the purchase link is not set", () => vi.stubEnv("REVENUECAT_WEB_PURCHASE_LINK", "")],
    ["the product id is not set", () => vi.stubEnv("REVENUECAT_WEB_PRODUCT_ID", "")],
    ["RevenueCat is not configured", () => revenueCatConfigFromEnv.mockReturnValue(null)],
  ])("503 offering-unavailable and no price when %s", async (_l, arrange) => {
    arrange();
    const res = await handler({ request: req() });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "offering-unavailable" });
  });
});
