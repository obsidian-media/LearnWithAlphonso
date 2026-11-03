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

function req(
  source: string | null = "hector_tab",
  authorization: string | null = "Bearer t",
  country?: string,
) {
  const url = new URL("https://example.com/api/pro-offering");
  if (source !== null) url.searchParams.set("source", source);
  const headers: Record<string, string> = authorization ? { Authorization: authorization } : {};
  if (country) headers["x-vercel-ip-country"] = country;
  return new Request(url, { headers });
}

const OFFER = { price: "$9.99", priceCountry: "US", period: "month", trialDays: 7 };

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
  it("shows RevenueCat's price to a learner in the price's own country", async () => {
    const body = await (await handler({ request: req("hector_tab", "Bearer t", "US") })).json();
    expect(body.price).toBe("$9.99");
  });

  it("shows no price to a learner elsewhere: checkout charges their own currency (CA$12.99 for Canada)", async () => {
    const res = await handler({ request: req("hector_tab", "Bearer t", "CA") });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.price).toBeNull();
    expect(body).toMatchObject({ period: "month", trialDays: 7 });
    expect(body).not.toHaveProperty("priceCountry");
  });

  it("shows no price when RevenueCat does not say which country its price is for", async () => {
    getWebOffering.mockResolvedValue({ ...OFFER, priceCountry: null });
    const body = await (await handler({ request: req("hector_tab", "Bearer t", "US") })).json();
    expect(body.price).toBeNull();
  });

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

  it("never hands the trial link to a learner who already had a trial (no second trial, whatever RevenueCat's own rule says)", async () => {
    getSubscriberSummary.mockResolvedValue({
      status: "inactive",
      store: null,
      trialEligible: false,
      managementUrl: null,
    });
    const body = await (await handler({ request: req() })).json();
    expect(body.purchaseUrl).not.toContain("trial_tok");
  });

  it("409 already-pro with no purchase link for a learner who already has Pro (no double purchase)", async () => {
    getSubscriberSummary.mockResolvedValue({
      status: "active",
      store: "app_store",
      trialEligible: false,
      managementUrl: null,
    });
    const res = await handler({ request: req() });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "already-pro" });
  });

  it.each([
    ["the offering cannot be read", () => getWebOffering.mockResolvedValue(null)],
    [
      "eligibility cannot be read",
      () => getSubscriberSummary.mockResolvedValue({ status: "unavailable" }),
    ],
    ["the purchase link is not set", () => vi.stubEnv("REVENUECAT_WEB_PURCHASE_LINK", "")],
    ["the no-trial link is not set", () => vi.stubEnv("REVENUECAT_WEB_PURCHASE_LINK_NO_TRIAL", "")],
    ["the product id is not set", () => vi.stubEnv("REVENUECAT_WEB_PRODUCT_ID", "")],
    ["RevenueCat is not configured", () => revenueCatConfigFromEnv.mockReturnValue(null)],
    ["the trial link is malformed", () => vi.stubEnv("REVENUECAT_WEB_PURCHASE_LINK", "not a url")],
    [
      "the trial link has no scheme",
      () => vi.stubEnv("REVENUECAT_WEB_PURCHASE_LINK", "pay.rev.cat/trial_tok"),
    ],
    [
      "the trial link is not https",
      () => vi.stubEnv("REVENUECAT_WEB_PURCHASE_LINK", "http://pay.rev.cat/trial_tok"),
    ],
    [
      "the no-trial link is malformed (for a learner who already had a trial)",
      () => {
        vi.stubEnv("REVENUECAT_WEB_PURCHASE_LINK_NO_TRIAL", "::bad::");
        getSubscriberSummary.mockResolvedValue({
          status: "inactive",
          store: null,
          trialEligible: false,
          managementUrl: null,
        });
      },
    ],
  ])("503 offering-unavailable and no price when %s", async (_l, arrange) => {
    arrange();
    const res = await handler({ request: req() });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "offering-unavailable" });
  });
});
