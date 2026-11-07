import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { auth: { getUser } } }));

const revenueCatConfigFromEnv = vi.fn();
const getSubscriberSummary = vi.fn();
// The routes read the account-level summary (both ids). Here it is the single-id summary plus the id the purchase
// lands on, which is the account id unless a test says otherwise (as without SUBSCRIPTION_ID_SECRET).
let loginIdOverride: string | null = null;
vi.mock("@/lib/revenuecat-entitlement", () => ({
  revenueCatConfigFromEnv,
  getAccountSubscriberSummary: async (...args: unknown[]) => {
    const s = (await getSubscriberSummary(...args)) as { status: string } | undefined;
    if (!s || s.status === "unavailable") return { ...s, loginId: null };
    return { ...s, loginId: loginIdOverride ?? args[1] };
  },
}));

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

// Made-up offers standing in for RevenueCat's answer.
const OFFER = {
  price: "$9.99",
  priceCountry: "US",
  amountMicros: 9_990_000,
  currency: "USD",
  period: "month",
  trialDays: 7,
};
const YEARLY_OFFER = { ...OFFER, price: "$59.99", amountMicros: 59_990_000, period: "year" };

function stubYearly() {
  vi.stubEnv("REVENUECAT_WEB_YEARLY_PRODUCT_ID", "prod_web_year");
  vi.stubEnv("REVENUECAT_WEB_YEARLY_PURCHASE_LINK", "https://pay.rev.cat/year_trial_tok");
  vi.stubEnv("REVENUECAT_WEB_YEARLY_PURCHASE_LINK_NO_TRIAL", "https://pay.rev.cat/year_plain_tok");
  getWebOffering.mockImplementation(async (_c: unknown, id: string) =>
    id === "prod_web_year" ? YEARLY_OFFER : OFFER,
  );
}

const periods = (body: { plans: { period: string }[] }) => body.plans.map((p) => p.period);

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("REVENUECAT_WEB_PRODUCT_ID", "prod_web");
  vi.stubEnv("REVENUECAT_WEB_PURCHASE_LINK", "https://pay.rev.cat/trial_tok");
  vi.stubEnv("REVENUECAT_WEB_PURCHASE_LINK_NO_TRIAL", "https://pay.rev.cat/plain_tok");
  vi.stubEnv("REVENUECAT_WEB_YEARLY_PRODUCT_ID", "");
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  revenueCatConfigFromEnv.mockReturnValue({ secretApiKey: "a", v2SecretKey: "b", projectId: "p" });
  getSubscriberSummary.mockReset();
  loginIdOverride = null;
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
    expect(body.plans[0]).toMatchObject({
      price: "$9.99",
      amountMicros: 9_990_000,
      currency: "USD",
    });
  });

  it("shows no price to a learner elsewhere: checkout charges their own currency (CA$12.99 for Canada)", async () => {
    const res = await handler({ request: req("hector_tab", "Bearer t", "CA") });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plans[0]).toMatchObject({
      price: null,
      amountMicros: null,
      currency: null,
      period: "month",
      trialDays: 7,
    });
    expect(body.plans[0]).not.toHaveProperty("priceCountry");
  });

  it("shows no price when RevenueCat does not say which country its price is for", async () => {
    getWebOffering.mockResolvedValue({ ...OFFER, priceCountry: null });
    const body = await (await handler({ request: req("hector_tab", "Bearer t", "US") })).json();
    expect(body.plans[0].price).toBeNull();
    expect(body.plans[0].amountMicros).toBeNull();
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
      plans: [
        {
          price: "$9.99",
          amountMicros: 9_990_000,
          currency: "USD",
          period: "month",
          trialDays: 7,
          purchaseUrl:
            "https://pay.rev.cat/trial_tok/user-1?metadata%5Bpaywall_source%5D=practice_hector_card",
        },
      ],
    });
  });

  it("the checkout lands on the account's subscription identifier, never on its visible account id", async () => {
    loginIdOverride = "sub_0123456789abcdef0123456789abcdef";
    const body = await (await handler({ request: req() })).json();
    expect(body.plans[0].purchaseUrl).toMatch(
      /^https:\/\/pay\.rev\.cat\/trial_tok\/sub_0123456789abcdef0123456789abcdef\?/,
    );
    expect(body.plans[0].purchaseUrl).not.toContain("user-1");
  });

  it("a learner who already had Pro gets no trial and the no-trial link", async () => {
    getSubscriberSummary.mockResolvedValue({
      status: "inactive",
      store: null,
      trialEligible: false,
      managementUrl: null,
    });
    const body = await (await handler({ request: req() })).json();
    expect(body.plans[0].trialDays).toBeNull();
    expect(body.plans[0].purchaseUrl).toMatch(/^https:\/\/pay\.rev\.cat\/plain_tok\/user-1\?/);
  });

  it("never hands the trial link to a learner who already had a trial (no second trial, whatever RevenueCat's own rule says)", async () => {
    getSubscriberSummary.mockResolvedValue({
      status: "inactive",
      store: null,
      trialEligible: false,
      managementUrl: null,
    });
    const body = await (await handler({ request: req() })).json();
    expect(body.plans[0].purchaseUrl).not.toContain("trial_tok");
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
  ])("503 offering-unavailable (a retry may help) and no price when %s", async (_l, arrange) => {
    arrange();
    const res = await handler({ request: req() });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "offering-unavailable" });
  });

  it.each([
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
      "the no-trial link is malformed",
      () => vi.stubEnv("REVENUECAT_WEB_PURCHASE_LINK_NO_TRIAL", "::bad::"),
    ],
  ])("503 not-configured (Pro is not on sale here yet) when %s", async (_l, arrange) => {
    arrange();
    const res = await handler({ request: req() });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "offering-unavailable", reason: "not-configured" });
  });

  describe("the yearly plan", () => {
    it("when configured: yearly first, then monthly, each with its own price and checkout link", async () => {
      stubYearly();
      const body = await (await handler({ request: req("hector_tab", "Bearer t", "US") })).json();
      expect(periods(body)).toEqual(["year", "month"]);
      expect(body.plans[0]).toMatchObject({ price: "$59.99", amountMicros: 59_990_000 });
      expect(body.plans[0].purchaseUrl).toMatch(
        /^https:\/\/pay\.rev\.cat\/year_trial_tok\/user-1\?/,
      );
      expect(body.plans[1].purchaseUrl).toMatch(/^https:\/\/pay\.rev\.cat\/trial_tok\/user-1\?/);
    });

    it("a learner who already had a trial gets the yearly no-trial link and no trial", async () => {
      stubYearly();
      getSubscriberSummary.mockResolvedValue({
        status: "inactive",
        store: null,
        trialEligible: false,
        managementUrl: null,
      });
      const body = await (await handler({ request: req() })).json();
      expect(body.plans[0].trialDays).toBeNull();
      expect(body.plans[0].purchaseUrl).toMatch(/year_plain_tok/);
      expect(JSON.stringify(body)).not.toMatch(/trial_tok/);
    });

    it.each([
      ["its product id is missing", () => vi.stubEnv("REVENUECAT_WEB_YEARLY_PRODUCT_ID", "")],
      [
        "its no-trial link is missing",
        () => vi.stubEnv("REVENUECAT_WEB_YEARLY_PURCHASE_LINK_NO_TRIAL", ""),
      ],
      ["its trial link is missing", () => vi.stubEnv("REVENUECAT_WEB_YEARLY_PURCHASE_LINK", "")],
      [
        "its trial link is not https",
        () =>
          vi.stubEnv("REVENUECAT_WEB_YEARLY_PURCHASE_LINK", "http://pay.rev.cat/year_trial_tok"),
      ],
      [
        "its product is not a yearly one",
        () =>
          getWebOffering.mockImplementation(async (_c: unknown, id: string) =>
            id === "prod_web_year" ? OFFER : OFFER,
          ),
      ],
      [
        "its offer cannot be read",
        () =>
          getWebOffering.mockImplementation(async (_c: unknown, id: string) =>
            id === "prod_web_year" ? null : OFFER,
          ),
      ],
    ])("left out, monthly still sold, when %s", async (_l, arrange) => {
      stubYearly();
      arrange();
      const res = await handler({ request: req() });
      expect(res.status).toBe(200);
      expect(periods(await res.json())).toEqual(["month"]);
    });
  });

  it("a monthly product id that names a yearly product sells nothing rather than two yearly plans", async () => {
    stubYearly();
    getWebOffering.mockResolvedValue(YEARLY_OFFER);
    const res = await handler({ request: req() });
    expect(res.status).toBe(503);
  });

  it("the answer carries no key, project id or product id, only what the paywall shows", async () => {
    stubYearly();
    revenueCatConfigFromEnv.mockReturnValue({
      secretApiKey: "sk_v1_do_not_leak",
      v2SecretKey: "sk_v2_do_not_leak",
      projectId: "proj_do_not_leak",
    });
    const body = await (await handler({ request: req("hector_tab", "Bearer t", "US") })).json();
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/do_not_leak|prod_web/);
    for (const plan of body.plans)
      expect(Object.keys(plan).sort()).toEqual(
        ["amountMicros", "currency", "period", "price", "purchaseUrl", "trialDays"].sort(),
      );
  });
});
