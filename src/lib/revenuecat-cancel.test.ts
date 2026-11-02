import { describe, expect, it, vi } from "vitest";
import { cancelWebSubscription, revenueCatConfigFromEnv } from "./revenuecat-entitlement";

const V1_ONLY = { secretApiKey: "sk_v1" };
const FULL = { secretApiKey: "sk_v1", v2SecretKey: "sk_v2", projectId: "proj1" };
const FUTURE = new Date(Date.now() + 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();

type Call = { url: string; method: string; auth: string | null };

/** Routes v1 subscriber reads, v2 subscription lists and v2 cancels to canned answers, recording each call. */
function fakeRevenueCat(opts: {
  v1Status?: number;
  subscriptions?: Record<
    string,
    { store: string; expires_date: string | null; unsubscribe_detected_at?: string | null }
  >;
  v2Items?: { id: string; store: string; auto_renewal_status: string }[];
  v2ListStatus?: number;
  cancelStatus?: number;
}) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const auth = new Headers(init?.headers).get("Authorization");
    calls.push({ url, method, auth });
    if (url.includes("/v1/subscribers/")) {
      const status = opts.v1Status ?? 200;
      if (status !== 200) return new Response("", { status });
      return Response.json({
        subscriber: { entitlements: {}, subscriptions: opts.subscriptions ?? {} },
      });
    }
    if (method === "GET" && url.endsWith("/subscriptions")) {
      const status = opts.v2ListStatus ?? 200;
      if (status !== 200) return new Response("", { status });
      return Response.json({ items: opts.v2Items ?? [] });
    }
    if (method === "POST" && url.endsWith("/actions/cancel")) {
      return new Response("{}", { status: opts.cancelStatus ?? 200 });
    }
    return new Response("", { status: 404 });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe("revenueCatConfigFromEnv (v2 settings)", () => {
  it("adds the v2 key and project id only when both are set", () => {
    expect(
      revenueCatConfigFromEnv({
        REVENUECAT_SECRET_API_KEY: "a",
        REVENUECAT_V2_SECRET_KEY: "b",
        REVENUECAT_PROJECT_ID: "p",
      } as NodeJS.ProcessEnv),
    ).toEqual({ secretApiKey: "a", v2SecretKey: "b", projectId: "p" });
    expect(
      revenueCatConfigFromEnv({
        REVENUECAT_SECRET_API_KEY: "a",
        REVENUECAT_V2_SECRET_KEY: "b",
      } as NodeJS.ProcessEnv),
    ).toEqual({ secretApiKey: "a" });
  });
});

describe("cancelWebSubscription", () => {
  it("a learner RevenueCat never saw has nothing to cancel", async () => {
    const { fetchImpl } = fakeRevenueCat({ v1Status: 404 });
    expect(await cancelWebSubscription(FULL, "u1", fetchImpl)).toBe("none");
  });

  it("an App Store subscriber has nothing to cancel here (only they can, in Apple), with no v2 call", async () => {
    const { calls, fetchImpl } = fakeRevenueCat({
      subscriptions: { pro_monthly: { store: "app_store", expires_date: FUTURE } },
    });
    expect(await cancelWebSubscription(V1_ONLY, "u1", fetchImpl)).toBe("none");
    expect(calls.every((c) => c.url.includes("/v1/"))).toBe(true);
  });

  it("an expired or already-cancelled web subscription has nothing left to cancel", async () => {
    const { fetchImpl } = fakeRevenueCat({
      subscriptions: {
        old: { store: "rc_billing", expires_date: PAST },
        stopped: { store: "rc_billing", expires_date: FUTURE, unsubscribe_detected_at: PAST },
      },
    });
    expect(await cancelWebSubscription(V1_ONLY, "u1", fetchImpl)).toBe("none");
  });

  it("cancels every renewing web subscription through the v2 API with the v2 key", async () => {
    const { calls, fetchImpl } = fakeRevenueCat({
      subscriptions: { pro_web: { store: "rc_billing", expires_date: FUTURE } },
      v2Items: [
        { id: "sub_1", store: "rc_billing", auto_renewal_status: "will_renew" },
        { id: "sub_ios", store: "app_store", auto_renewal_status: "will_renew" },
        { id: "sub_done", store: "rc_billing", auto_renewal_status: "will_not_renew" },
      ],
    });
    expect(await cancelWebSubscription(FULL, "u 1", fetchImpl)).toBe("cancelled");
    const cancels = calls.filter((c) => c.method === "POST");
    expect(cancels.map((c) => c.url)).toEqual([
      "https://api.revenuecat.com/v2/projects/proj1/subscriptions/sub_1/actions/cancel",
    ]);
    expect(cancels[0].auth).toBe("Bearer sk_v2");
    expect(calls.find((c) => c.url.includes("/v2/") && c.method === "GET")?.url).toBe(
      "https://api.revenuecat.com/v2/projects/proj1/customers/u%201/subscriptions",
    );
  });

  it("a live web subscription with no v2 settings is a failure, never 'none'", async () => {
    const { fetchImpl } = fakeRevenueCat({
      subscriptions: { pro_web: { store: "rc_billing", expires_date: FUTURE } },
    });
    expect(await cancelWebSubscription(V1_ONLY, "u1", fetchImpl)).toBe("failed");
  });

  it.each([
    ["the subscriber read fails", { v1Status: 500 }],
    [
      "the v2 list fails",
      { subscriptions: { w: { store: "rc_billing", expires_date: FUTURE } }, v2ListStatus: 500 },
    ],
    [
      "a cancel is refused",
      {
        subscriptions: { w: { store: "rc_billing", expires_date: FUTURE } },
        v2Items: [{ id: "s", store: "rc_billing", auto_renewal_status: "will_renew" }],
        cancelStatus: 500,
      },
    ],
  ])("fails when %s", async (_label, opts) => {
    const { fetchImpl } = fakeRevenueCat(opts);
    expect(await cancelWebSubscription(FULL, "u1", fetchImpl)).toBe("failed");
  });

  it("a live web subscription that v2 does not list as cancellable is a failure, never 'cancelled' (I1)", async () => {
    const { calls, fetchImpl } = fakeRevenueCat({
      subscriptions: { pro_web: { store: "rc_billing", expires_date: FUTURE } },
      v2Items: [{ id: "sub_ios", store: "app_store", auto_renewal_status: "will_renew" }],
    });
    expect(await cancelWebSubscription(FULL, "u1", fetchImpl)).toBe("failed");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("a subscription that will change product is still renewing and gets cancelled (I1)", async () => {
    const { calls, fetchImpl } = fakeRevenueCat({
      subscriptions: { pro_web: { store: "rc_billing", expires_date: FUTURE } },
      v2Items: [{ id: "sub_1", store: "rc_billing", auto_renewal_status: "will_change_product" }],
    });
    expect(await cancelWebSubscription(FULL, "u1", fetchImpl)).toBe("cancelled");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });

  it("a live subscription in a store we do not recognise is treated as possibly web, never 'none' (I2)", async () => {
    const { fetchImpl } = fakeRevenueCat({
      subscriptions: { pro_web: { store: "web_billing_v3", expires_date: FUTURE } },
    });
    expect(await cancelWebSubscription(V1_ONLY, "u1", fetchImpl)).toBe("failed");
    const v2 = fakeRevenueCat({
      subscriptions: { pro_web: { store: "web_billing_v3", expires_date: FUTURE } },
      v2Items: [{ id: "sub_1", store: "web_billing_v3", auto_renewal_status: "will_renew" }],
    });
    expect(await cancelWebSubscription(FULL, "u1", v2.fetchImpl)).toBe("cancelled");
  });

  it("promotional and Play Store subscriptions are not web billing", async () => {
    const { fetchImpl } = fakeRevenueCat({
      subscriptions: {
        promo: { store: "promotional", expires_date: FUTURE },
        android: { store: "play_store", expires_date: FUTURE },
      },
    });
    expect(await cancelWebSubscription(V1_ONLY, "u1", fetchImpl)).toBe("none");
  });

  it("never throws", async () => {
    const fetchImpl = (async () => {
      throw new Error("down");
    }) as unknown as typeof fetch;
    expect(await cancelWebSubscription(FULL, "u1", fetchImpl)).toBe("failed");
  });
});
