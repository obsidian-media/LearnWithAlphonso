import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACTIVE_ENTITLEMENT_CACHE_MS,
  getProEntitlementStatus,
  resetEntitlementCache,
} from "./revenuecat-entitlement";

const CONFIG = { secretApiKey: "sk_test" };

type Mode = "active" | "inactive" | "down";
function server(mode: { current: Mode }) {
  const calls = { n: 0 };
  const fake = (async () => {
    calls.n += 1;
    if (mode.current === "down") return new Response("", { status: 500 });
    const future = new Date(Date.now() + 86_400_000).toISOString();
    return new Response(
      JSON.stringify({
        subscriber: {
          entitlements:
            mode.current === "active"
              ? { pro: { expires_date: future, product_identifier: "pro_monthly" } }
              : {},
          subscriptions: mode.current === "active" ? { pro_monthly: { store: "app_store" } } : {},
          management_url: null,
        },
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  return { fake, calls };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-18T10:00:00Z"));
  resetEntitlementCache();
});
afterEach(() => vi.useRealTimers());

describe("getProEntitlementStatus keeps a positive answer for a minute", () => {
  it("a paying learner is still active during a short RevenueCat outage", async () => {
    const mode = { current: "active" as Mode };
    const { fake, calls } = server(mode);
    expect(await getProEntitlementStatus(CONFIG, "u1", fake)).toBe("active");
    mode.current = "down";
    vi.setSystemTime(Date.now() + 30_000);
    expect(await getProEntitlementStatus(CONFIG, "u1", fake)).toBe("active");
    expect(calls.n).toBe(1); // the second answer came from the cache
  });

  it("after the minute it asks again, and an outage is then reported as unavailable", async () => {
    const mode = { current: "active" as Mode };
    const { fake } = server(mode);
    await getProEntitlementStatus(CONFIG, "u1", fake);
    mode.current = "down";
    vi.setSystemTime(Date.now() + ACTIVE_ENTITLEMENT_CACHE_MS + 1);
    expect(await getProEntitlementStatus(CONFIG, "u1", fake)).toBe("unavailable");
  });

  it("never caches inactive: a purchase is seen on the very next call", async () => {
    const mode = { current: "inactive" as Mode };
    const { fake, calls } = server(mode);
    expect(await getProEntitlementStatus(CONFIG, "u1", fake)).toBe("inactive");
    mode.current = "active";
    expect(await getProEntitlementStatus(CONFIG, "u1", fake)).toBe("active");
    expect(calls.n).toBe(2);
  });

  it("never caches unavailable: the next call asks again", async () => {
    const mode = { current: "down" as Mode };
    const { fake, calls } = server(mode);
    expect(await getProEntitlementStatus(CONFIG, "u1", fake)).toBe("unavailable");
    mode.current = "active";
    expect(await getProEntitlementStatus(CONFIG, "u1", fake)).toBe("active");
    expect(calls.n).toBe(2);
  });

  it("is per learner: one learner's cached answer never answers for another", async () => {
    const mode = { current: "active" as Mode };
    const { fake, calls } = server(mode);
    await getProEntitlementStatus(CONFIG, "u1", fake);
    mode.current = "inactive";
    expect(await getProEntitlementStatus(CONFIG, "u2", fake)).toBe("inactive");
    expect(calls.n).toBe(2);
  });

  it("a lapse seen after the window clears the cached answer", async () => {
    const mode = { current: "active" as Mode };
    const { fake } = server(mode);
    await getProEntitlementStatus(CONFIG, "u1", fake);
    mode.current = "inactive";
    vi.setSystemTime(Date.now() + ACTIVE_ENTITLEMENT_CACHE_MS + 1);
    expect(await getProEntitlementStatus(CONFIG, "u1", fake)).toBe("inactive");
    mode.current = "down";
    expect(await getProEntitlementStatus(CONFIG, "u1", fake)).toBe("unavailable");
  });
});
