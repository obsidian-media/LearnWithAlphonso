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

/**
 * Whether `appUserId` (this app's Supabase user id -- see this module's
 * own header comment on why that's the right lookup key) currently has
 * an active "pro" entitlement.
 *
 * **Fails closed on every "we could not tell"**: RevenueCat unreachable,
 * a non-2xx response (including 404 -- a subscriber RevenueCat has
 * never seen, e.g. one who hasn't opened the app since `logIn` shipped),
 * or a malformed body. Never throws. The one thing this returns `true`
 * for is a confirmed, currently-active entitlement -- anything else is
 * "no", which is the safe direction for an authorization gate.
 */
export async function isProSubscriber(
  config: RevenueCatConfig,
  appUserId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const res = await fetchImpl(
      `${REVENUECAT_API_HOST}/v1/subscribers/${encodeURIComponent(appUserId)}`,
      {
        headers: { Authorization: `Bearer ${config.secretApiKey}` },
      },
    );
    if (!res.ok) return false;

    const body = (await res.json()) as {
      subscriber?: { entitlements?: Record<string, { expires_date?: string | null }> };
    };
    const entitlement = body.subscriber?.entitlements?.[PRO_ENTITLEMENT_ID];
    if (!entitlement) return false;
    // A null expires_date is RevenueCat's shape for a non-expiring
    // (lifetime, or promotional) entitlement.
    if (!entitlement.expires_date) return true;
    return new Date(entitlement.expires_date).getTime() > Date.now();
  } catch {
    return false;
  }
}
