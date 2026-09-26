import { describe, expect, it } from "vitest";
import { isProSubscriber, revenueCatConfigFromEnv } from "./revenuecat-entitlement";

describe("revenueCatConfigFromEnv", () => {
  it("returns null when the secret key is missing", () => {
    expect(revenueCatConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it("returns the config when the secret key is present", () => {
    const config = revenueCatConfigFromEnv({
      REVENUECAT_SECRET_API_KEY: "sk_test",
    } as NodeJS.ProcessEnv);
    expect(config).toEqual({ secretApiKey: "sk_test" });
  });
});

describe("isProSubscriber", () => {
  const CONFIG = { secretApiKey: "sk_test" };

  function fakeSubscriberResponse(entitlements: Record<string, { expires_date: string | null }>) {
    return (async () =>
      new Response(JSON.stringify({ subscriber: { entitlements } }), {
        status: 200,
      })) as typeof fetch;
  }

  it("returns true for a non-expiring (lifetime) pro entitlement", async () => {
    const fake = fakeSubscriberResponse({ pro: { expires_date: null } });
    expect(await isProSubscriber(CONFIG, "user-1", fake)).toBe(true);
  });

  it("returns true for a pro entitlement that expires in the future", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const fake = fakeSubscriberResponse({ pro: { expires_date: future } });
    expect(await isProSubscriber(CONFIG, "user-1", fake)).toBe(true);
  });

  it("returns false for a pro entitlement that already expired", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const fake = fakeSubscriberResponse({ pro: { expires_date: past } });
    expect(await isProSubscriber(CONFIG, "user-1", fake)).toBe(false);
  });

  it("returns false when the subscriber has no pro entitlement at all", async () => {
    const fake = fakeSubscriberResponse({});
    expect(await isProSubscriber(CONFIG, "user-1", fake)).toBe(false);
  });

  it("returns false, not throws, when RevenueCat answers a non-2xx status", async () => {
    // Covers a subscriber RevenueCat has never seen (404) the same way
    // as any other failure -- fail closed, the safe direction for an
    // authorization gate.
    const fake = (async () => new Response("{}", { status: 404 })) as typeof fetch;
    expect(await isProSubscriber(CONFIG, "user-1", fake)).toBe(false);
  });

  it("returns false, not throws, when the network is down", async () => {
    const fake = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    await expect(isProSubscriber(CONFIG, "user-1", fake)).resolves.toBe(false);
  });

  it("looks up the subscriber by the exact app_user_id passed in, with the secret key as the bearer token", async () => {
    let sentUrl: string | undefined;
    let sentAuth: string | null = null;
    const fake = (async (url: string, init?: RequestInit) => {
      sentUrl = url;
      sentAuth = (init?.headers as Record<string, string>)?.Authorization ?? null;
      return new Response(JSON.stringify({ subscriber: { entitlements: {} } }), { status: 200 });
    }) as unknown as typeof fetch;

    await isProSubscriber(CONFIG, "user with spaces", fake);

    expect(sentUrl).toBe("https://api.revenuecat.com/v1/subscribers/user%20with%20spaces");
    expect(sentAuth).toBe("Bearer sk_test");
  });
});
