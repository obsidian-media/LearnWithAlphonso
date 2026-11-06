import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  accountAppUserIds,
  cancelAccountWebSubscriptions,
  deleteAccountSubscribers,
  getAccountSubscriberSummary,
  getProEntitlementStatus,
  type RevenueCatConfig,
  revenueCatConfigFromEnv,
  subscriptionAppUserId,
} from "./revenuecat-entitlement";

const USER = "00000000-0000-4000-8000-000000000001";
const SECRET = "s".repeat(40);
const SUB = subscriptionAppUserId(USER, SECRET);
const CONFIG: RevenueCatConfig = { secretApiKey: "sk", subscriptionIdSecret: SECRET };
const FUTURE = "2099-01-01T00:00:00Z";

type Sub = { entitlements?: Record<string, unknown>; subscriptions?: Record<string, unknown> };
/** RevenueCat v1 by id: a subscriber body, a status code, or 404 when absent. */
function rc(byId: Record<string, Sub | number>) {
  const calls: { url: string; method: string }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET" });
    const id = decodeURIComponent(url.split("/v1/subscribers/")[1] ?? "");
    const v = byId[id];
    if (v === undefined) return new Response("{}", { status: 404 });
    if (typeof v === "number") return new Response("{}", { status: v });
    return new Response(
      JSON.stringify({ subscriber: { entitlements: {}, subscriptions: {}, ...v } }),
      {
        status: 200,
      },
    );
  }) as unknown as typeof fetch;
  return { f, calls };
}
const pro = (store = "app_store"): Sub => ({
  entitlements: { pro: { expires_date: FUTURE, product_identifier: "m" } },
  subscriptions: { m: { store } },
});
const lapsed: Sub = { entitlements: {}, subscriptions: { m: { store: "app_store" } } };

describe("the separate subscription identifier", () => {
  it("is derived from the account id, never equals it, and has RevenueCat's allowed shape", () => {
    const expected = createHmac("sha256", SECRET).update(`rc-subscription:${USER}`).digest("hex");
    expect(SUB).toBe(`sub_${expected.slice(0, 32)}`);
    expect(SUB).toMatch(/^sub_[0-9a-f]{32}$/);
    // Pinned: supabase/functions/_shared/hearts-pro.test.ts expects this exact value from the Deno copy.
    expect(SUB).toBe("sub_dcd123662574a0f80033b28550db273c");
    expect(SUB).not.toContain(USER);
    expect(subscriptionAppUserId("00000000-0000-4000-8000-000000000002", SECRET)).not.toBe(SUB);
    expect(subscriptionAppUserId(USER, "t".repeat(40))).not.toBe(SUB);
  });

  it("is on only with a secret of at least 32 characters", () => {
    const base = { REVENUECAT_SECRET_API_KEY: "sk" } as NodeJS.ProcessEnv;
    expect(revenueCatConfigFromEnv(base)?.subscriptionIdSecret).toBeUndefined();
    expect(
      revenueCatConfigFromEnv({ ...base, SUBSCRIPTION_ID_SECRET: "short" })?.subscriptionIdSecret,
    ).toBeUndefined();
    expect(
      revenueCatConfigFromEnv({ ...base, SUBSCRIPTION_ID_SECRET: SECRET })?.subscriptionIdSecret,
    ).toBe(SECRET);
    expect(accountAppUserIds({ secretApiKey: "sk" }, USER)).toEqual([USER]);
    expect(accountAppUserIds(CONFIG, USER)).toEqual([SUB, USER]);
  });
});

describe("getAccountSubscriberSummary: the server accepts both ids", () => {
  it("Pro bought under the subscription identifier counts, and the apps log in with it", async () => {
    const s = await getAccountSubscriberSummary(CONFIG, USER, rc({ [SUB]: pro() }).f);
    expect(s).toMatchObject({ status: "active", store: "app_store", loginId: SUB });
  });

  it("Pro bought on an older app (under the account id) still counts, and those apps keep that id", async () => {
    const s = await getAccountSubscriberSummary(CONFIG, USER, rc({ [USER]: pro() }).f);
    expect(s).toMatchObject({ status: "active", loginId: USER });
  });

  it("a new learner with no purchases anywhere gets the subscription identifier and a trial", async () => {
    const s = await getAccountSubscriberSummary(CONFIG, USER, rc({}).f);
    expect(s).toMatchObject({ status: "inactive", trialEligible: true, loginId: SUB });
  });

  it("one free trial per person: a lapsed subscription under either id ends trial eligibility", async () => {
    for (const byId of [{ [USER]: lapsed }, { [SUB]: lapsed }]) {
      expect(await getAccountSubscriberSummary(CONFIG, USER, rc(byId).f)).toMatchObject({
        status: "inactive",
        trialEligible: false,
      });
    }
  });

  it("Pro on one id wins over an outage on the other; an outage with no Pro anywhere is unavailable", async () => {
    expect(
      (await getAccountSubscriberSummary(CONFIG, USER, rc({ [SUB]: 500, [USER]: pro() }).f)).status,
    ).toBe("active");
    expect(await getAccountSubscriberSummary(CONFIG, USER, rc({ [SUB]: 500 }).f)).toEqual({
      status: "unavailable",
      loginId: null,
    });
  });

  it("the test-purchase list is matched by account id, also for purchases under the subscription identifier", async () => {
    const testStore = { [SUB]: pro("test_store") };
    expect((await getAccountSubscriberSummary(CONFIG, USER, rc(testStore).f)).status).toBe(
      "inactive",
    );
    const tester = { ...CONFIG, testPurchaseUserIds: [USER] };
    expect((await getAccountSubscriberSummary(tester, USER, rc(testStore).f)).status).toBe(
      "active",
    );
  });

  it("without the secret only the account id is asked, exactly as before", async () => {
    const t = rc({ [USER]: pro() });
    expect(await getProEntitlementStatus({ secretApiKey: "sk" }, USER, t.f)).toBe("active");
    expect(t.calls.map((c) => c.url)).toEqual([
      `https://api.revenuecat.com/v1/subscribers/${USER}`,
    ]);
  });
});

describe("account deletion erases both ids", () => {
  it("deletes the subscriber under the subscription identifier and under the account id", async () => {
    const t = rc({});
    expect(await deleteAccountSubscribers(CONFIG, USER, t.f)).toBe("erased");
    expect(t.calls.filter((c) => c.method === "DELETE").map((c) => c.url)).toEqual([
      `https://api.revenuecat.com/v1/subscribers/${SUB}`,
      `https://api.revenuecat.com/v1/subscribers/${USER}`,
    ]);
  });

  it("is failed if either id could not be erased, so the retry queue keeps it", async () => {
    const f = (async (url: string, init?: RequestInit) =>
      new Response("{}", {
        status: init?.method === "DELETE" && url.includes(SUB) ? 500 : 200,
      })) as unknown as typeof fetch;
    expect(await deleteAccountSubscribers(CONFIG, USER, f)).toBe("failed");
  });

  it("checks both ids for a website subscription to cancel", async () => {
    const t = rc({});
    expect(await cancelAccountWebSubscriptions(CONFIG, USER, t.f)).toBe("none");
    expect(t.calls.map((c) => c.url)).toEqual([
      `https://api.revenuecat.com/v1/subscribers/${SUB}`,
      `https://api.revenuecat.com/v1/subscribers/${USER}`,
    ]);
  });
});
