import { describe, expect, it, vi } from "vitest";
import {
  deleteRevenueCatSubscriber,
  getProEntitlementStatus,
  isProSubscriber,
  revenueCatConfigFromEnv,
} from "./revenuecat-entitlement";

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

  it("distinguishes an inactive subscriber from an upstream failure", async () => {
    const missing = (async () => new Response("{}", { status: 404 })) as typeof fetch;
    const outage = (async () => new Response("{}", { status: 503 })) as typeof fetch;
    expect(await getProEntitlementStatus(CONFIG, "user-1", missing)).toBe("inactive");
    expect(await getProEntitlementStatus(CONFIG, "user-1", outage)).toBe("unavailable");
  });

  it("treats malformed success responses as unavailable", async () => {
    const malformed = (async () =>
      new Response(JSON.stringify({ subscriber: {} }))) as typeof fetch;
    expect(await getProEntitlementStatus(CONFIG, "user-1", malformed)).toBe("unavailable");
  });

  it("sets a five-second deadline on the upstream request", async () => {
    const deadline = new AbortController().signal;
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline);
    let sent: AbortSignal | null | undefined;
    const fake = (async (_url: string, init?: RequestInit) => {
      sent = init?.signal;
      return new Response(JSON.stringify({ subscriber: { entitlements: {} } }));
    }) as unknown as typeof fetch;
    expect(await getProEntitlementStatus(CONFIG, "user-1", fake)).toBe("inactive");
    expect(timeout).toHaveBeenCalledWith(5000);
    expect(sent).toBe(deadline);
    timeout.mockRestore();
  });

  it("reports unavailable, not inactive, when the request hits its deadline", async () => {
    const fake = (async () => {
      throw new DOMException("timed out", "TimeoutError");
    }) as unknown as typeof fetch;
    expect(await getProEntitlementStatus(CONFIG, "user-1", fake)).toBe("unavailable");
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

describe("deleteRevenueCatSubscriber", () => {
  const CONFIG = { secretApiKey: "sk_test_delete" };
  it("sends a DELETE for the exact subscriber, with the secret key and a deadline", async () => {
    let sent: { url: string; init?: RequestInit } | undefined;
    const fake = (async (url: string, init?: RequestInit) => {
      sent = { url, init };
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    expect(await deleteRevenueCatSubscriber(CONFIG, "user with spaces", fake)).toBe("erased");
    expect(sent?.url).toBe("https://api.revenuecat.com/v1/subscribers/user%20with%20spaces");
    expect(sent?.init?.method).toBe("DELETE");
    expect((sent?.init?.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${CONFIG.secretApiKey}`,
    );
    expect(sent?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("counts a subscriber RevenueCat never saw as erased", async () => {
    const fake = (async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;
    expect(await deleteRevenueCatSubscriber(CONFIG, "user-1", fake)).toBe("erased");
  });

  it("reports a failure, without throwing, on an error status or a network error", async () => {
    const down = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    expect(await deleteRevenueCatSubscriber(CONFIG, "user-1", down)).toBe("failed");
    const broken = (async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    expect(await deleteRevenueCatSubscriber(CONFIG, "user-1", broken)).toBe("failed");
  });
});
