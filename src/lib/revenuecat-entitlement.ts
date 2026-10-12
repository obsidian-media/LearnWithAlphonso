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
  return { secretApiKey };
}

export type ProEntitlementStatus = "active" | "inactive" | "unavailable";

/** Keep an upstream outage distinct from a confirmed lack of entitlement. */
export async function getProEntitlementStatus(
  config: RevenueCatConfig,
  appUserId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProEntitlementStatus> {
  try {
    const res = await fetchImpl(
      `${REVENUECAT_API_HOST}/v1/subscribers/${encodeURIComponent(appUserId)}`,
      {
        headers: { Authorization: `Bearer ${config.secretApiKey}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (res.status === 404) return "inactive";
    if (!res.ok) return "unavailable";

    const body = (await res.json()) as {
      subscriber?: { entitlements?: Record<string, { expires_date?: string | null }> };
    };
    if (!body?.subscriber?.entitlements || typeof body.subscriber.entitlements !== "object") {
      return "unavailable";
    }
    const entitlement = body.subscriber?.entitlements?.[PRO_ENTITLEMENT_ID];
    if (!entitlement) return "inactive";
    // A null expires_date is RevenueCat's shape for a non-expiring
    // (lifetime, or promotional) entitlement.
    if (entitlement.expires_date === null) return "active";
    if (typeof entitlement.expires_date !== "string") return "unavailable";
    const expiry = new Date(entitlement.expires_date).getTime();
    if (Number.isNaN(expiry)) return "unavailable";
    return expiry > Date.now() ? "active" : "inactive";
  } catch {
    return "unavailable";
  }
}

/** Boolean compatibility helper for authorization-only callers. */
export async function isProSubscriber(
  config: RevenueCatConfig,
  appUserId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  return (await getProEntitlementStatus(config, appUserId, fetchImpl)) === "active";
}
