import { describe, expect, it, vi } from "vitest";
import {
  getSubscriberSummary,
  grantPromotionalPro,
  revokePromotionalPro,
} from "./revenuecat-entitlement";

const CONFIG = { secretApiKey: "sk_test_secret" };
const DAY = 86_400_000;

describe("a promotional entitlement", () => {
  it("reads as active Pro from the promotional store", async () => {
    const future = new Date(Date.now() + DAY).toISOString();
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          subscriber: {
            entitlements: { pro: { expires_date: future, product_identifier: "rc_promo_pro_x" } },
            subscriptions: { rc_promo_pro_x: { store: "promotional" } },
          },
        }),
        { status: 200 },
      )) as typeof fetch;
    const summary = await getSubscriberSummary(CONFIG, "user-1", fetchImpl);
    expect(summary).toMatchObject({ status: "active", store: "promotional", managementUrl: null });
  });
});

describe("grantPromotionalPro", () => {
  it("posts end_time_ms to the promotional endpoint with the secret key", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const end = Date.now() + 30 * DAY;
    await grantPromotionalPro(CONFIG, "sub_abc/1", end, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://api.revenuecat.com/v1/subscribers/sub_abc%2F1/entitlements/pro/promotional",
    );
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ end_time_ms: end });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk_test_secret");
  });

  it("throws with the status only, never the response body or the key", async () => {
    const fetchImpl = (async () =>
      new Response("secret detail sk_test_secret", { status: 500 })) as typeof fetch;
    const err = await grantPromotionalPro(CONFIG, "u", Date.now() + DAY, fetchImpl).catch(
      (e: Error) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("500");
    expect((err as Error).message).not.toContain("secret");
  });

  it("throws when the network fails", async () => {
    const fetchImpl = (async () => {
      throw new Error("socket sk_test_secret");
    }) as typeof fetch;
    const err = await grantPromotionalPro(CONFIG, "u", Date.now() + DAY, fetchImpl).catch(
      (e: Error) => e,
    );
    expect((err as Error).message).not.toContain("sk_test_secret");
  });
});

describe("revokePromotionalPro", () => {
  it("posts to revoke_promotionals", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    await revokePromotionalPro(CONFIG, "user-9", fetchImpl as unknown as typeof fetch);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://api.revenuecat.com/v1/subscribers/user-9/entitlements/pro/revoke_promotionals",
    );
    expect(init.method).toBe("POST");
  });

  it("throws on a non-2xx with the status only", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 403 })) as typeof fetch;
    await expect(revokePromotionalPro(CONFIG, "u", fetchImpl)).rejects.toThrow(/403/);
  });
});

describe("revokePromotionalPro for an unknown subscriber", () => {
  it("treats a 404 as nothing to revoke", async () => {
    const fetchImpl = (async () => new Response("", { status: 404 })) as typeof fetch;
    await expect(revokePromotionalPro(CONFIG, "never-seen", fetchImpl)).resolves.toBeUndefined();
  });
});
