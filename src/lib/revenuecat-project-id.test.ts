import { describe, expect, it, vi } from "vitest";
import { getAccountSubscriberSummary, revenueCatConfigFromEnv } from "./revenuecat-entitlement";

const env = (projectId?: string) =>
  ({
    REVENUECAT_SECRET_API_KEY: "sk_v1",
    REVENUECAT_V2_SECRET_KEY: "sk_v2",
    REVENUECAT_PROJECT_ID: projectId,
  }) as unknown as NodeJS.ProcessEnv;

describe("REVENUECAT_PROJECT_ID", () => {
  it.each([
    ["945111ee", "proj945111ee"],
    ["proj945111ee", "proj945111ee"],
    [" 945111ee ", "proj945111ee"],
  ])("%s becomes %s", (raw, want) => {
    expect(revenueCatConfigFromEnv(env(raw))?.projectId).toBe(want);
  });
  it("stays unset when empty", () => {
    expect(revenueCatConfigFromEnv(env(""))?.projectId).toBeUndefined();
  });
});

describe("getAccountSubscriberSummary for the paywall", () => {
  const config = { secretApiKey: "sk_v1" };
  const sub = (entitlements: unknown) =>
    vi.fn(async () =>
      Response.json({ subscriber: { entitlements, subscriptions: {} } }),
    ) as unknown as typeof fetch;

  it("a free account is inactive with a login id (so the paywall can sell)", async () => {
    const s = await getAccountSubscriberSummary(config, "u1", sub({}));
    expect(s).toMatchObject({ status: "inactive", trialEligible: true, loginId: "u1" });
  });

  it("a promotional Pro is active with a login id", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const s = await getAccountSubscriberSummary(
      config,
      "u1",
      sub({ pro: { expires_date: future, product_identifier: "rc_promo_pro_cat" } }),
    );
    expect(s).toMatchObject({ status: "active", loginId: "u1" });
  });

  it("a RevenueCat error is unavailable with no login id", async () => {
    const f = vi.fn(async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    expect(await getAccountSubscriberSummary(config, "u1", f)).toEqual({
      status: "unavailable",
      loginId: null,
    });
  });
});
