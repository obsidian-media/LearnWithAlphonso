// Alphonso Pro has unlimited hearts. This decides "is this learner Pro" for the hearts economy only, and records the
// answer in hearts_pro_status so the lose_heart() RPC (which cannot call RevenueCat) honours it during the lesson.
//
// The Pro rule is a Deno port of getSubscriberSummary in src/lib/revenuecat-entitlement.ts (entitlement "pro" active;
// Test Store purchases only for the listed test accounts; sandbox only when not rejected). Keep the two in step.
//
// Env: REVENUECAT_SECRET_API_KEY (without it nobody is Pro here, which is the behaviour before this existed),
// REVENUECAT_TEST_PURCHASE_USER_IDS, REVENUECAT_REJECT_SANDBOX.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";

const PRO_ENTITLEMENT_ID = "pro";
/** A confirmed Pro answer is trusted for an hour (the same window lose_heart() honours). */
export const PRO_FRESH_MS = 60 * 60 * 1000;
/** A confirmed non-Pro answer is re-checked after ten minutes, so a new subscriber is not kept waiting long. */
export const NOT_PRO_FRESH_MS = 10 * 60 * 1000;

type PurchaseRecord = { store?: string; is_sandbox?: boolean };
type SubscriberBody = {
  subscriber?: {
    entitlements?: Record<string, { expires_date?: string | null; product_identifier?: string }>;
    subscriptions?: Record<string, PurchaseRecord>;
    non_subscriptions?: Record<string, PurchaseRecord[]>;
  };
};

export type ProConfig = {
  secretApiKey: string;
  testers: string[];
  rejectSandbox: boolean;
  /** SUBSCRIPTION_ID_SECRET (same value as on Vercel): purchases can also be under the subscription identifier. */
  subscriptionIdSecret?: string;
};

/**
 * The account's separate subscription identifier. Keep identical to subscriptionAppUserId in
 * src/lib/revenuecat-entitlement.ts (a test pins both to the same value).
 */
export function subscriptionAppUserId(userId: string, secret: string): string {
  const mac = createHmac("sha256", secret).update(`rc-subscription:${userId}`).digest("hex");
  return `sub_${mac.slice(0, 32)}`;
}

/** Every RevenueCat id this account's purchases can be under: the subscription identifier first, then the account id. */
export function accountAppUserIds(config: ProConfig, userId: string): string[] {
  return config.subscriptionIdSecret
    ? [subscriptionAppUserId(userId, config.subscriptionIdSecret), userId]
    : [userId];
}

export function proConfigFromEnv(
  get: (k: string) => string | undefined = (k) => Deno.env.get(k),
): ProConfig | null {
  const secretApiKey = get("REVENUECAT_SECRET_API_KEY");
  if (!secretApiKey) return null;
  const testers = (get("REVENUECAT_TEST_PURCHASE_USER_IDS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const idSecret = get("SUBSCRIPTION_ID_SECRET")?.trim();
  return {
    secretApiKey,
    testers,
    rejectSandbox: get("REVENUECAT_REJECT_SANDBOX") === "true",
    ...(idSecret && idSecret.length >= 32 ? { subscriptionIdSecret: idSecret } : {}),
  };
}

/** True / false from a RevenueCat v1 subscriber body; null when the body is not readable. */
export function proFromSubscriber(
  body: SubscriberBody,
  /** The Supabase account id: the test-purchase list is matched by account id. */
  accountId: string,
  config: ProConfig,
  now: number,
): boolean | null {
  const subscriber = body?.subscriber;
  if (!subscriber?.entitlements || typeof subscriber.entitlements !== "object") return null;
  const entitlement = subscriber.entitlements[PRO_ENTITLEMENT_ID];
  if (!entitlement) return false;
  if (entitlement.expires_date !== null) {
    if (typeof entitlement.expires_date !== "string") return null;
    const expiry = new Date(entitlement.expires_date).getTime();
    if (Number.isNaN(expiry)) return null;
    if (expiry <= now) return false;
  }
  const productId = entitlement.product_identifier;
  const subs = subscriber.subscriptions ?? {};
  const oneTime = productId ? subscriber.non_subscriptions?.[productId] : undefined;
  const purchase = productId
    ? (subs[productId] ?? (Array.isArray(oneTime) ? oneTime.at(-1) : undefined))
    : undefined;
  if (!purchase || config.testers.includes(accountId)) return true;
  if (purchase.store === "test_store") return false;
  if (config.rejectSandbox && purchase.is_sandbox === true) return false;
  return true;
}

export type HeartsProDeps = {
  config: () => ProConfig | null;
  fetch: typeof fetch;
  now: () => number;
};

export const liveHeartsProDeps = (): HeartsProDeps => ({
  config: () => proConfigFromEnv(),
  fetch: globalThis.fetch.bind(globalThis),
  now: () => Date.now(),
});

/**
 * Whether this learner has unlimited hearts right now. Never throws, and fails closed (false: hearts work as for
 * everyone) when RevenueCat cannot be asked. A fresh cached answer is reused; a new answer is cached.
 */
export async function heartsUnlimitedFor(
  admin: SupabaseClient,
  userId: string,
  deps: HeartsProDeps = liveHeartsProDeps(),
): Promise<boolean> {
  try {
    const now = deps.now();
    const { data: cached } = await admin
      .from("hearts_pro_status")
      .select("pro, checked_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (cached && typeof cached.checked_at === "string") {
      const age = now - new Date(cached.checked_at).getTime();
      if (age >= 0 && age < (cached.pro ? PRO_FRESH_MS : NOT_PRO_FRESH_MS))
        return cached.pro === true;
    }
    const config = deps.config();
    if (!config) return false;
    // Pro under either id is Pro; an unreadable id with no Pro anywhere is not cached (fails closed).
    const answers = await Promise.all(
      accountAppUserIds(config, userId).map(async (id): Promise<boolean | null> => {
        const res = await deps.fetch(
          `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(id)}`,
          {
            headers: { Authorization: `Bearer ${config.secretApiKey}` },
            signal: AbortSignal.timeout(3000),
          },
        );
        if (res.status === 404) return false;
        if (!res.ok) return null;
        return proFromSubscriber((await res.json()) as SubscriberBody, userId, config, now);
      }),
    );
    const pro = answers.includes(true) ? true : answers.includes(null) ? null : false;
    if (pro === null) return false;
    await admin
      .from("hearts_pro_status")
      .upsert(
        { user_id: userId, pro, checked_at: new Date(now).toISOString() },
        { onConflict: "user_id" },
      );
    return pro;
  } catch {
    return false;
  }
}
