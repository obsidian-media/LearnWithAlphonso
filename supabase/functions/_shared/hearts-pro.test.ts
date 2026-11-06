// Run: deno test supabase/functions/_shared/hearts-pro.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  heartsUnlimitedFor,
  type ProConfig,
  proFromSubscriber,
  subscriptionAppUserId,
} from "./hearts-pro.ts";

const NOW = Date.parse("2026-11-05T12:00:00Z");
const CONFIG: ProConfig = { secretApiKey: "sk", testers: [], rejectSandbox: false };

function fakeAdmin(row: { pro: boolean; checked_at: string } | null) {
  const upserts: Record<string, unknown>[] = [];
  const admin = {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }),
      }),
      upsert: (r: Record<string, unknown>) => {
        upserts.push(r);
        return Promise.resolve({ error: null });
      },
    }),
  } as unknown as SupabaseClient;
  return { admin, upserts };
}

function rc(status: number, body: unknown = {}) {
  const calls: string[] = [];
  const f = ((url: string) => {
    calls.push(url);
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  }) as unknown as typeof fetch;
  return { f, calls };
}

const active = (store = "app_store") => ({
  subscriber: {
    entitlements: { pro: { expires_date: "2026-12-01T00:00:00Z", product_identifier: "m" } },
    subscriptions: { m: { store } },
  },
});

Deno.test("a fresh cached Pro answer is reused without asking RevenueCat", async () => {
  const { admin } = fakeAdmin({ pro: true, checked_at: new Date(NOW - 30 * 60_000).toISOString() });
  const { f, calls } = rc(200, active());
  assertEquals(
    await heartsUnlimitedFor(admin, "u", { config: () => CONFIG, fetch: f, now: () => NOW }),
    true,
  );
  assertEquals(calls.length, 0);
});

Deno.test("a stale answer is re-checked and the new answer cached", async () => {
  const { admin, upserts } = fakeAdmin({
    pro: false,
    checked_at: new Date(NOW - 11 * 60_000).toISOString(),
  });
  const { f, calls } = rc(200, active());
  assertEquals(
    await heartsUnlimitedFor(admin, "u", { config: () => CONFIG, fetch: f, now: () => NOW }),
    true,
  );
  assertEquals(calls.length, 1);
  assertEquals(upserts[0]?.pro, true);
});

Deno.test("without the RevenueCat key nobody is Pro and nothing is cached", async () => {
  const { admin, upserts } = fakeAdmin(null);
  const { f, calls } = rc(200, active());
  assertEquals(
    await heartsUnlimitedFor(admin, "u", { config: () => null, fetch: f, now: () => NOW }),
    false,
  );
  assertEquals(calls.length + upserts.length, 0);
});

Deno.test("a RevenueCat outage fails closed and is not cached", async () => {
  const { admin, upserts } = fakeAdmin(null);
  const { f } = rc(503);
  assertEquals(
    await heartsUnlimitedFor(admin, "u", { config: () => CONFIG, fetch: f, now: () => NOW }),
    false,
  );
  assertEquals(upserts.length, 0);
});

Deno.test("an unknown subscriber (404) is cached as not Pro", async () => {
  const { admin, upserts } = fakeAdmin(null);
  const { f } = rc(404);
  assertEquals(
    await heartsUnlimitedFor(admin, "u", { config: () => CONFIG, fetch: f, now: () => NOW }),
    false,
  );
  assertEquals(upserts[0]?.pro, false);
});

Deno.test("the Pro rule matches the web: expiry, lifetime, Test Store, testers, sandbox", () => {
  assertEquals(proFromSubscriber(active(), "u", CONFIG, NOW), true);
  assertEquals(proFromSubscriber(active(), "u", CONFIG, Date.parse("2027-01-01")), false);
  assertEquals(
    proFromSubscriber(
      { subscriber: { entitlements: { pro: { expires_date: null } } } },
      "u",
      CONFIG,
      NOW,
    ),
    true,
  );
  assertEquals(proFromSubscriber({ subscriber: { entitlements: {} } }, "u", CONFIG, NOW), false);
  assertEquals(proFromSubscriber(active("test_store"), "u", CONFIG, NOW), false);
  assertEquals(
    proFromSubscriber(active("test_store"), "u", { ...CONFIG, testers: ["u"] }, NOW),
    true,
  );
  const sandbox = {
    subscriber: {
      entitlements: { pro: { expires_date: "2026-12-01T00:00:00Z", product_identifier: "m" } },
      subscriptions: { m: { store: "app_store", is_sandbox: true } },
    },
  };
  assertEquals(proFromSubscriber(sandbox, "u", CONFIG, NOW), true);
  assertEquals(proFromSubscriber(sandbox, "u", { ...CONFIG, rejectSandbox: true }, NOW), false);
  assertEquals(proFromSubscriber({}, "u", CONFIG, NOW), null);
});

const SECRET = "s".repeat(40);
const USER = "00000000-0000-4000-8000-000000000001";

Deno.test("the subscription identifier matches the web's (pinned value)", () => {
  // Same input as src/lib/revenuecat-subscription-id.test.ts; both copies must produce this.
  assertEquals(subscriptionAppUserId(USER, SECRET), "sub_dcd123662574a0f80033b28550db273c");
});

Deno.test(
  "Pro under the subscription identifier or under the account id both give unlimited hearts",
  async () => {
    const sub = subscriptionAppUserId(USER, SECRET);
    for (const proId of [sub, USER]) {
      const { admin } = fakeAdmin(null);
      const seen: string[] = [];
      const f = ((url: string) => {
        seen.push(url);
        const id = decodeURIComponent(url.split("/v1/subscribers/")[1]!);
        return Promise.resolve(
          new Response(
            JSON.stringify(id === proId ? active() : { subscriber: { entitlements: {} } }),
            { status: 200 },
          ),
        );
      }) as unknown as typeof fetch;
      const config = { ...CONFIG, subscriptionIdSecret: SECRET };
      assertEquals(
        await heartsUnlimitedFor(admin, USER, { config: () => config, fetch: f, now: () => NOW }),
        true,
      );
      assertEquals(seen.length, 2);
    }
  },
);

Deno.test(
  "an outage on one id with no Pro on the other fails closed and is not cached",
  async () => {
    const { admin, upserts } = fakeAdmin(null);
    const f = ((url: string) =>
      Promise.resolve(
        new Response("{}", { status: url.includes("sub_") ? 503 : 404 }),
      )) as unknown as typeof fetch;
    const config = { ...CONFIG, subscriptionIdSecret: SECRET };
    assertEquals(
      await heartsUnlimitedFor(admin, USER, { config: () => config, fetch: f, now: () => NOW }),
      false,
    );
    assertEquals(upserts.length, 0);
  },
);
