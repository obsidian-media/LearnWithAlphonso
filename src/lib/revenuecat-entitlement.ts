/**
 * Server-side RevenueCat entitlement verification.
 *
 * Hector re-parenting Phase 1's own prerequisite
 * (docs/superpowers/specs/2026-09-26-hector-reparenting-design.md):
 * before this, this app's backend had no way to check "is this user
 * Pro" at all -- `EntitlementStore` (iOS) only ever asks the RevenueCat
 * *client* SDK, which a server endpoint can't reach into. Any design
 * that gates a server action on entitlement (a shadow Cloud Voice
 * account is a real, costed resource) needed this built and tested
 * first, not assumed -- getting this wrong makes a paid feature
 * reachable by anyone, which is worse than the problem it fixes.
 *
 * **Depends on `Purchases.shared.logIn(supabaseUserID)` being called
 * client-side** (see `EntitlementStore.login`, iOS) so RevenueCat's own
 * `app_user_id` for a given subscriber IS this app's Supabase user id.
 * Without that, this always looks up the wrong subscriber (or none) --
 * RevenueCat is configured with no explicit `appUserID` today, so every
 * install gets its own anonymous `$RCAnonymousID:...` with no
 * connection to a Supabase user id at all.
 *
 * Uses RevenueCat's REST API directly
 * (https://www.revenuecat.com/docs/api-v1) with the project's *secret*
 * API key -- never the publishable SDK key AppConfig.revenueCatAPIKey
 * ships to the client. That secret must never reach the app binary.
 */

const REVENUECAT_API_HOST = "https://api.revenuecat.com";
/** Matches AppConfig.proEntitlementID (iOS) -- the RevenueCat dashboard's Entitlement identifier. */
const PRO_ENTITLEMENT_ID = "pro";

export type RevenueCatConfig = {
  secretApiKey: string;
  /** RevenueCat API v2 (Web Billing cancel, prices). Present only when both are set. */
  v2SecretKey?: string;
  projectId?: string;
};

/**
 * Reads the one setting, or returns null when it's missing.
 *
 * Null is a first-class outcome, not an error -- this app must remain
 * deployable before this secret exists, same posture as every other
 * config-gated integration in this codebase (Apple revocation, Hector
 * revocation). Callers that gate a real action on entitlement must fail
 * closed (not-pro) when this is null, never fail open.
 */
export function revenueCatConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): RevenueCatConfig | null {
  const secretApiKey = env.REVENUECAT_SECRET_API_KEY;
  if (!secretApiKey) return null;
  const v2SecretKey = env.REVENUECAT_V2_SECRET_KEY;
  const projectId = env.REVENUECAT_PROJECT_ID;
  return v2SecretKey && projectId ? { secretApiKey, v2SecretKey, projectId } : { secretApiKey };
}

export type ProEntitlementStatus = "active" | "inactive" | "unavailable";

/** Where the active Pro came from. "web" is RevenueCat Web Billing (Stripe), bought on the website. */
export type ProStore = "app_store" | "web" | "play_store" | null;

export type SubscriberSummary =
  | { status: "unavailable" }
  | {
      status: "active" | "inactive";
      store: ProStore;
      /** False once the learner has had any subscription, in any store: one free trial per person. */
      trialEligible: boolean;
      /** The web billing customer portal; only for a web subscription (App Store ones are managed in iOS Settings). */
      managementUrl: string | null;
    };

// RevenueCat's v1 `store` for Web Billing is not documented; rc_billing (Web Billing) and stripe (Stripe Billing)
// are the two web stores. Confirm against a sandbox purchase (web Hector plan, Task 0).
const WEB_STORES = new Set(["rc_billing", "stripe"]);

/** The page renders this as a link, so only an absolute https URL passes. */
function httpsUrlOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}
// Stores that are certainly not website billing. Account deletion treats any other live store as possibly web, so
// an unrecognised value can never be mistaken for "nothing to cancel".
const NOT_WEB_STORES = new Set([
  "app_store",
  "mac_app_store",
  "play_store",
  "amazon",
  "promotional",
]);
const possiblyWeb = (store: unknown) => typeof store === "string" && !NOT_WEB_STORES.has(store);

function storeOf(raw: unknown): ProStore {
  if (raw === "app_store" || raw === "mac_app_store") return "app_store";
  if (raw === "play_store") return "play_store";
  if (typeof raw === "string" && WEB_STORES.has(raw)) return "web";
  return null;
}

/**
 * One read of the RevenueCat subscriber: Pro status, which store it came from, trial eligibility and the web
 * management link. Keeps an upstream outage ("unavailable") distinct from a confirmed lack of entitlement.
 */
export async function getSubscriberSummary(
  config: RevenueCatConfig,
  appUserId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SubscriberSummary> {
  const none = { store: null, managementUrl: null } as const;
  try {
    const res = await fetchImpl(
      `${REVENUECAT_API_HOST}/v1/subscribers/${encodeURIComponent(appUserId)}`,
      {
        headers: { Authorization: `Bearer ${config.secretApiKey}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (res.status === 404) return { status: "inactive", trialEligible: true, ...none };
    if (!res.ok) return { status: "unavailable" };

    const body = (await res.json()) as {
      subscriber?: {
        entitlements?: Record<
          string,
          { expires_date?: string | null; product_identifier?: string }
        >;
        subscriptions?: Record<string, { store?: string }>;
        management_url?: string | null;
      };
    };
    const subscriber = body?.subscriber;
    if (!subscriber?.entitlements || typeof subscriber.entitlements !== "object") {
      return { status: "unavailable" };
    }
    const subscriptions =
      subscriber.subscriptions && typeof subscriber.subscriptions === "object"
        ? subscriber.subscriptions
        : {};
    const trialEligible = Object.keys(subscriptions).length === 0;

    const entitlement = subscriber.entitlements[PRO_ENTITLEMENT_ID];
    if (!entitlement) return { status: "inactive", trialEligible, ...none };
    // A null expires_date is RevenueCat's shape for a non-expiring (lifetime, or promotional) entitlement.
    let active: boolean;
    if (entitlement.expires_date === null) active = true;
    else {
      if (typeof entitlement.expires_date !== "string") return { status: "unavailable" };
      const expiry = new Date(entitlement.expires_date).getTime();
      if (Number.isNaN(expiry)) return { status: "unavailable" };
      active = expiry > Date.now();
    }
    if (!active) return { status: "inactive", trialEligible, ...none };

    const productId = entitlement.product_identifier;
    const store = productId ? storeOf(subscriptions[productId]?.store) : null;
    const managementUrl = store === "web" ? httpsUrlOrNull(subscriber.management_url) : null;
    return { status: "active", store, trialEligible, managementUrl };
  } catch {
    return { status: "unavailable" };
  }
}

/** Keep an upstream outage distinct from a confirmed lack of entitlement. */
export async function getProEntitlementStatus(
  config: RevenueCatConfig,
  appUserId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProEntitlementStatus> {
  return (await getSubscriberSummary(config, appUserId, fetchImpl)).status;
}

/** Boolean compatibility helper for authorization-only callers. */
export async function isProSubscriber(
  config: RevenueCatConfig,
  appUserId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  return (await getProEntitlementStatus(config, appUserId, fetchImpl)) === "active";
}

/**
 * Stops a website (RevenueCat Web Billing) subscription from ever charging again, for a deleted account. RevenueCat's
 * cancel ends it at the period end with no refund, which is what account deletion promises; the account is gone, so
 * the remaining access is moot. App Store subscriptions return "none": only the learner can cancel those, in Apple.
 *
 * Reads the v1 subscriber first, so a learner with no live web subscription never needs the v2 key. A live web
 * subscription without v2 settings is "failed", never "none": an erased record with live billing is the failure this
 * exists to prevent. Never throws.
 *
 * The v2 list endpoint and the item fields (store, auto_renewal_status) are from RevenueCat's v2 docs; confirm them
 * against a sandbox purchase (web Hector plan, Task 0).
 */
export async function cancelWebSubscription(
  config: RevenueCatConfig,
  appUserId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<"cancelled" | "none" | "failed"> {
  try {
    const res = await fetchImpl(
      `${REVENUECAT_API_HOST}/v1/subscribers/${encodeURIComponent(appUserId)}`,
      {
        headers: { Authorization: `Bearer ${config.secretApiKey}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (res.status === 404) return "none";
    if (!res.ok) return "failed";
    const body = (await res.json()) as {
      subscriber?: {
        subscriptions?: Record<
          string,
          { store?: string; expires_date?: string | null; unsubscribe_detected_at?: string | null }
        >;
      };
    };
    const now = Date.now();
    const live = Object.values(body?.subscriber?.subscriptions ?? {}).some(
      (s) =>
        possiblyWeb(s?.store) &&
        !s.unsubscribe_detected_at &&
        (s.expires_date === null || new Date(s.expires_date ?? 0).getTime() > now),
    );
    if (!live) return "none";
    if (!config.v2SecretKey || !config.projectId) return "failed";

    const v2 = { Authorization: `Bearer ${config.v2SecretKey}` };
    const project = encodeURIComponent(config.projectId);
    const list = await fetchImpl(
      `${REVENUECAT_API_HOST}/v2/projects/${project}/customers/${encodeURIComponent(appUserId)}/subscriptions`,
      { headers: v2, signal: AbortSignal.timeout(5000) },
    );
    if (!list.ok) return "failed";
    const items =
      (
        (await list.json()) as {
          items?: { id?: string; store?: string; auto_renewal_status?: string }[];
        }
      )?.items ?? [];
    let cancelled = 0;
    for (const item of items) {
      if (!item?.id || !possiblyWeb(item.store)) continue;
      // Anything but "will not renew" can still charge (for example will_change_product).
      if (item.auto_renewal_status === "will_not_renew") continue;
      const cancel = await fetchImpl(
        `${REVENUECAT_API_HOST}/v2/projects/${project}/subscriptions/${encodeURIComponent(item.id)}/actions/cancel`,
        { method: "POST", headers: v2, signal: AbortSignal.timeout(5000) },
      );
      if (!cancel.ok) return "failed";
      cancelled += 1;
    }
    // v1 says a web subscription is live, so cancelling nothing (an unexpected v2 shape, a second page) is a failure:
    // reporting success here would erase the record while the card is still being charged.
    return cancelled > 0 ? "cancelled" : "failed";
  } catch {
    return "failed";
  }
}

/**
 * Erases this account's subscriber record at RevenueCat (purchase history tied to our user id). Called after
 * an account is deleted, because the privacy policy promises associated records are erased and RevenueCat is
 * the one processor that keys data by the account id. It does not cancel an App Store subscription: only the
 * learner can do that, in their Apple account. Never throws. A subscriber RevenueCat never saw (404) counts
 * as erased.
 */
export async function deleteRevenueCatSubscriber(
  config: RevenueCatConfig,
  appUserId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<"erased" | "failed"> {
  try {
    const res = await fetchImpl(
      `${REVENUECAT_API_HOST}/v1/subscribers/${encodeURIComponent(appUserId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${config.secretApiKey}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    return res.ok || res.status === 404 ? "erased" : "failed";
  } catch {
    return "failed";
  }
}
