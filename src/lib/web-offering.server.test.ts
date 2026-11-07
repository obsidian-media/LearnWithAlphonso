import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildPurchaseUrl,
  clearWebOfferingCache,
  getWebOffering,
  parseIsoDuration,
} from "./web-offering.server";

const CONFIG = { secretApiKey: "sk_v1", v2SecretKey: "sk_v2", projectId: "proj1" };

function productsResponse(items: unknown[]) {
  return vi.fn(async () => Response.json({ items })) as unknown as typeof fetch;
}

beforeEach(() => clearWebOfferingCache());

describe("parseIsoDuration", () => {
  it.each([
    ["P1M", { unit: "month", value: 1 }],
    ["P1Y", { unit: "year", value: 1 }],
    ["P12M", { unit: "month", value: 12 }],
    ["P7D", { unit: "day", value: 7 }],
    ["P2W", { unit: "week", value: 2 }],
  ])("%s", (raw, expected) => {
    expect(parseIsoDuration(raw)).toEqual(expected);
  });
  it("rejects anything else", () => {
    expect(parseIsoDuration("1 month")).toBeNull();
    expect(parseIsoDuration(undefined)).toBeNull();
  });
});

describe("getWebOffering", () => {
  const product = {
    id: "prod_web",
    subscription: { duration: "P1M", trial_duration: "P7D" },
    indicative_price: { currency: "CAD", amount_micros: 12_990_000, country: "CA" },
  };

  it("reads price, period and trial from RevenueCat v2 with the v2 key, formatted in its own currency", async () => {
    const fetchImpl = productsResponse([{ id: "other" }, product]);
    expect(await getWebOffering(CONFIG, "prod_web", fetchImpl)).toEqual({
      price: new Intl.NumberFormat("en", { style: "currency", currency: "CAD" }).format(12.99),
      priceCountry: "CA",
      amountMicros: 12_990_000,
      currency: "CAD",
      period: "month",
      trialDays: 7,
    });
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://api.revenuecat.com/v2/projects/proj1/products?expand=items.indicative_price",
    );
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer sk_v2");
  });

  it("treats a 12-month plan as yearly and a week trial as days; an array price uses its first entry", async () => {
    const fetchImpl = productsResponse([
      {
        id: "y",
        subscription: { duration: "P12M", trial_duration: "P1W" },
        indicative_price: [{ currency: "USD", amount_micros: 79_990_000 }],
      },
    ]);
    expect(await getWebOffering(CONFIG, "y", fetchImpl)).toMatchObject({
      period: "year",
      trialDays: 7,
    });
  });

  it("no trial on the product means trialDays null", async () => {
    const fetchImpl = productsResponse([{ ...product, subscription: { duration: "P1M" } }]);
    expect(await getWebOffering(CONFIG, "prod_web", fetchImpl)).toMatchObject({ trialDays: null });
  });

  it.each([
    ["the product is missing", productsResponse([{ id: "other" }])],
    ["there is no price", productsResponse([{ ...product, indicative_price: undefined }])],
    [
      "the period is not month or year",
      productsResponse([{ ...product, subscription: { duration: "P3M" } }]),
    ],
    [
      "RevenueCat fails",
      vi.fn(async () => new Response("", { status: 500 })) as unknown as typeof fetch,
    ],
  ])("returns null (no price shown) when %s", async (_l, fetchImpl) => {
    expect(await getWebOffering(CONFIG, "prod_web", fetchImpl)).toBeNull();
  });

  it("returns null without v2 settings, and never calls RevenueCat", async () => {
    const fetchImpl = productsResponse([product]);
    expect(await getWebOffering({ secretApiKey: "sk" }, "prod_web", fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("caches a good answer (RevenueCat allows 60 product reads a minute)", async () => {
    const fetchImpl = productsResponse([product]);
    await getWebOffering(CONFIG, "prod_web", fetchImpl);
    await getWebOffering(CONFIG, "prod_web", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("caches each product on its own, so yearly and monthly do not evict each other", async () => {
    const fetchImpl = productsResponse([
      product,
      { ...product, id: "prod_year", subscription: { duration: "P1Y", trial_duration: "P7D" } },
    ]);
    expect(await getWebOffering(CONFIG, "prod_web", fetchImpl)).toMatchObject({ period: "month" });
    expect(await getWebOffering(CONFIG, "prod_year", fetchImpl)).toMatchObject({ period: "year" });
    expect(await getWebOffering(CONFIG, "prod_web", fetchImpl)).toMatchObject({ period: "month" });
    expect(await getWebOffering(CONFIG, "prod_year", fetchImpl)).toMatchObject({ period: "year" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("buildPurchaseUrl", () => {
  it("appends the url-encoded user id as a path segment and the paywall source as metadata", () => {
    expect(buildPurchaseUrl("https://pay.rev.cat/tok123", "user 1", "hector_tab")).toBe(
      "https://pay.rev.cat/tok123/user%201?metadata%5Bpaywall_source%5D=hector_tab",
    );
    expect(buildPurchaseUrl("https://pay.rev.cat/tok123/", "u", "practice_end_prompt")).toBe(
      "https://pay.rev.cat/tok123/u?metadata%5Bpaywall_source%5D=practice_end_prompt",
    );
  });
});
