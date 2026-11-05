import { describe, expect, it } from "vitest";
import { getProEntitlementStatus, getSubscriberSummary } from "./revenuecat-entitlement";

const CONFIG = { secretApiKey: "sk_test" };
const FUTURE = new Date(Date.now() + 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();

function respond(status: number, body?: unknown) {
  return (async () =>
    new Response(body === undefined ? "" : JSON.stringify(body), { status })) as typeof fetch;
}

function subscriber(opts: {
  pro?: { expires_date: string | null; product_identifier: string };
  subscriptions?: Record<string, { store: string }>;
  management_url?: string | null;
}) {
  return {
    subscriber: {
      entitlements: opts.pro ? { pro: opts.pro } : {},
      subscriptions: opts.subscriptions ?? {},
      management_url: opts.management_url ?? null,
    },
  };
}

describe("getSubscriberSummary", () => {
  it("active App Store Pro: store app_store, no web management link, no second trial", async () => {
    const fake = respond(
      200,
      subscriber({
        pro: { expires_date: FUTURE, product_identifier: "pro_monthly" },
        subscriptions: { pro_monthly: { store: "app_store" } },
        management_url: "https://apps.apple.com/account/subscriptions",
      }),
    );
    expect(await getSubscriberSummary(CONFIG, "u1", fake)).toEqual({
      status: "active",
      store: "app_store",
      trialEligible: false,
      managementUrl: null,
    });
  });

  it.each(["rc_billing", "stripe"])(
    "active web Pro (%s): store web with the portal link",
    async (store) => {
      const fake = respond(
        200,
        subscriber({
          pro: { expires_date: FUTURE, product_identifier: "pro_web_monthly" },
          subscriptions: { pro_web_monthly: { store } },
          management_url: "https://billing.example/portal/abc",
        }),
      );
      expect(await getSubscriberSummary(CONFIG, "u1", fake)).toEqual({
        status: "active",
        store: "web",
        trialEligible: false,
        managementUrl: "https://billing.example/portal/abc",
      });
    },
  );

  it.each([
    "http://billing.example/portal/abc",
    "javascript:alert(1)",
    "not a url",
    "//evil.example/x",
  ])(
    "active web Pro with a non-https management link (%s): no link, never a clickable non-https href",
    async (url) => {
      const fake = respond(
        200,
        subscriber({
          pro: { expires_date: FUTURE, product_identifier: "pro_web_monthly" },
          subscriptions: { pro_web_monthly: { store: "rc_billing" } },
          management_url: url,
        }),
      );
      const summary = await getSubscriberSummary(CONFIG, "u1", fake);
      expect(summary).toMatchObject({ status: "active", store: "web", managementUrl: null });
    },
  );

  it("no subscriber yet (404): inactive and trial-eligible", async () => {
    expect(await getSubscriberSummary(CONFIG, "u1", respond(404))).toEqual({
      status: "inactive",
      store: null,
      trialEligible: true,
      managementUrl: null,
    });
  });

  it("expired App Store subscription: inactive, and the trial is used up", async () => {
    const fake = respond(
      200,
      subscriber({
        pro: { expires_date: PAST, product_identifier: "pro_monthly" },
        subscriptions: { pro_monthly: { store: "app_store" } },
      }),
    );
    expect(await getSubscriberSummary(CONFIG, "u1", fake)).toEqual({
      status: "inactive",
      store: null,
      trialEligible: false,
      managementUrl: null,
    });
  });

  it("a subscriber record with no subscriptions at all stays trial-eligible", async () => {
    const fake = respond(200, subscriber({}));
    expect((await getSubscriberSummary(CONFIG, "u1", fake)).status).toBe("inactive");
    expect(await getSubscriberSummary(CONFIG, "u1", fake)).toMatchObject({ trialEligible: true });
  });

  it.each([
    ["a 5xx", respond(503, { error: "x" })],
    ["a malformed body", respond(200, { nope: true })],
    [
      "a thrown fetch",
      (async () => {
        throw new Error("down");
      }) as unknown as typeof fetch,
    ],
  ])("%s is unavailable, never inactive", async (_label, fake) => {
    expect(await getSubscriberSummary(CONFIG, "u1", fake)).toEqual({ status: "unavailable" });
  });

  it("getProEntitlementStatus reports the same status as the summary", async () => {
    const fake = respond(
      200,
      subscriber({
        pro: { expires_date: FUTURE, product_identifier: "p" },
        subscriptions: { p: { store: "app_store" } },
      }),
    );
    expect(await getProEntitlementStatus(CONFIG, "u1", fake)).toBe("active");
    expect(await getProEntitlementStatus(CONFIG, "u1", respond(404))).toBe("inactive");
    expect(await getProEntitlementStatus(CONFIG, "u1", respond(500))).toBe("unavailable");
  });
});

describe("purchases made outside a real store", () => {
  function backed(entry: Record<string, unknown>, nonSubscription = false) {
    const pro = { expires_date: nonSubscription ? null : FUTURE, product_identifier: "pro_monthly" };
    return {
      subscriber: {
        entitlements: { pro },
        subscriptions: nonSubscription ? {} : { pro_monthly: entry },
        non_subscriptions: nonSubscription ? { pro_monthly: [entry] } : {},
        management_url: null,
      },
    };
  }

  it("a RevenueCat Test Store purchase does not count as Pro", async () => {
    const fake = respond(200, backed({ store: "test_store", is_sandbox: true }));
    expect((await getSubscriberSummary(CONFIG, "u1", fake)).status).toBe("inactive");
  });

  it("a Test Store one-time purchase does not count as Pro either", async () => {
    const fake = respond(200, backed({ store: "test_store", is_sandbox: true }, true));
    expect((await getSubscriberSummary(CONFIG, "u1", fake)).status).toBe("inactive");
  });

  it("a Test Store purchase counts for an allowlisted tester account", async () => {
    const fake = respond(200, backed({ store: "test_store", is_sandbox: true }));
    const config = { ...CONFIG, testPurchaseUserIds: ["u1"] };
    expect((await getSubscriberSummary(config, "u1", fake)).status).toBe("active");
  });

  it("an App Store sandbox purchase still counts by default (App Review and TestFlight buy in sandbox)", async () => {
    const fake = respond(200, backed({ store: "app_store", is_sandbox: true }));
    expect((await getSubscriberSummary(CONFIG, "u1", fake)).status).toBe("active");
  });

  it("an App Store sandbox purchase does not count when sandbox purchases are switched off", async () => {
    const fake = respond(200, backed({ store: "app_store", is_sandbox: true }));
    const config = { ...CONFIG, rejectSandbox: true };
    expect((await getSubscriberSummary(config, "u1", fake)).status).toBe("inactive");
  });

  it("a real App Store purchase is unaffected by either setting", async () => {
    const fake = respond(200, backed({ store: "app_store", is_sandbox: false }));
    const config = { ...CONFIG, rejectSandbox: true };
    expect((await getSubscriberSummary(config, "u1", fake)).status).toBe("active");
  });

  it("a promotional grant (no backing purchase) still counts", async () => {
    const fake = respond(200, {
      subscriber: {
        entitlements: { pro: { expires_date: FUTURE, product_identifier: "rc_promo_pro_yearly" } },
        subscriptions: { rc_promo_pro_yearly: { store: "promotional", is_sandbox: false } },
      },
    });
    expect((await getSubscriberSummary({ ...CONFIG, rejectSandbox: true }, "u1", fake)).status).toBe(
      "active",
    );
  });
});
