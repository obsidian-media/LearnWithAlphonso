/**
 * Grants the Pro entitlement to the App Review demo account, via
 * RevenueCat's promotional-entitlement API.
 *
 * **Why a promotional grant rather than a purchase.** "Alphonso Pro
 * Monthly" is our FIRST auto-renewable subscription, so per Apple's own
 * rules `offerings()` cannot load until it is reviewed alongside the
 * build -- nobody, reviewer included, can buy it yet. A promotional
 * entitlement is granted server-side and is independent of that gate, so
 * it is the only way the reviewer can reach Hector at all. The same
 * grant serves the screenshot pipeline, which must not depend on the
 * paywall for the identical reason.
 *
 * **Why this is a workflow and not a local script.** The RevenueCat
 * *secret* key and the service-role key live in repo secrets and must
 * never pass through an agent session. This runs in CI, reads them from
 * the environment, and prints neither.
 *
 * **Why the account comes from a secret and not a workflow input.** This
 * repository is PUBLIC, and `workflow_dispatch` inputs are visible in
 * run logs to anyone. The demo account's address is not something to
 * publish, so it is read from `DEMO_ACCOUNT_EMAIL` instead.
 *
 * Usage: dispatch `.github/workflows/grant-demo-entitlement.yml`.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REVENUECAT_SECRET_API_KEY = process.env.REVENUECAT_SECRET_API_KEY;
const DEMO_ACCOUNT_EMAIL = process.env.DEMO_ACCOUNT_EMAIL;
const ENTITLEMENT = process.env.ENTITLEMENT || "pro";
const DURATION = process.env.DURATION || "lifetime";

const missing = [
  ["SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE_KEY],
  ["REVENUECAT_SECRET_API_KEY", REVENUECAT_SECRET_API_KEY],
  ["DEMO_ACCOUNT_EMAIL", DEMO_ACCOUNT_EMAIL],
]
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length) {
  console.error(`Missing environment variable(s): ${missing.join(", ")}`);
  process.exit(1);
}

/** A uuid is not a secret, but this runs in a PUBLIC repo's logs. */
function short(id: string): string {
  return `${id.slice(0, 8)}...${id.slice(-4)}`;
}

/**
 * The Supabase user id IS RevenueCat's `app_user_id` -- that is the key
 * `isProSubscriber` looks the subscriber up by
 * (`revenuecat-entitlement.ts`). Granting against anything else would
 * produce an entitlement the server gate can never see.
 */
async function resolveUserId(): Promise<string> {
  const target = DEMO_ACCOUNT_EMAIL!.trim().toLowerCase();
  // GoTrue's admin list is paginated; walk it rather than assuming the
  // account is on page one.
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=200`, {
      headers: {
        apikey: SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });
    if (!res.ok) throw new Error(`admin/users -> ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { users?: Array<{ id: string; email?: string }> };
    const users = body.users ?? [];
    if (users.length === 0) break;
    const match = users.find((u) => (u.email ?? "").trim().toLowerCase() === target);
    if (match) return match.id;
  }
  throw new Error(
    "No account matches DEMO_ACCOUNT_EMAIL. Check the secret's value -- " +
      "the address must already have signed up at least once.",
  );
}

/** RevenueCat's v1 GET is "get OR CREATE" -- see `main`'s use of it. */
async function fetchSubscriber(appUserId: string) {
  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
    { headers: { Authorization: `Bearer ${REVENUECAT_SECRET_API_KEY}` } },
  );
  if (!res.ok) throw new Error(`subscriber -> ${res.status}: ${await res.text()}`);
  return (await res.json()) as {
    subscriber?: { entitlements?: Record<string, { expires_date?: string | null }> };
  };
}

async function main() {
  const appUserId = await resolveUserId();
  console.log(`Resolved demo account -> app_user_id ${short(appUserId)}`);

  // The promotional endpoint 404s with `{"code":7259,"subscriber was not
  // found"}` for an app_user_id RevenueCat has never seen -- which is the
  // normal state for an account that has not opened the app since
  // `EntitlementStore.login(userID:)` started aliasing the Supabase id to
  // RevenueCat. v1's GET is documented as get-OR-CREATE, so touching it
  // first materialises the subscriber without requiring anyone to launch
  // the app. Observed live: run 36228241619.
  await fetchSubscriber(appUserId);
  console.log("Subscriber exists (created if RevenueCat had not seen it).");

  console.log(`Granting "${ENTITLEMENT}" (${DURATION})...`);
  const grant = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}` +
      `/entitlements/${encodeURIComponent(ENTITLEMENT)}/promotional`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REVENUECAT_SECRET_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ duration: DURATION }),
    },
  );
  if (!grant.ok) {
    throw new Error(`grant -> ${grant.status}: ${await grant.text()}`);
  }

  // Read it back rather than trusting the 201. This asserts the exact
  // property that matters -- that `isProSubscriber` will now answer true
  // for this account -- using the same shape that function reads
  // (`subscriber.entitlements[id].expires_date`, null meaning lifetime).
  const body = await fetchSubscriber(appUserId);
  const ent = body.subscriber?.entitlements?.[ENTITLEMENT];
  if (!ent) {
    throw new Error(
      `Granted, but "${ENTITLEMENT}" is absent when reading the subscriber back. ` +
        `Check the entitlement identifier matches RevenueCat's dashboard.`,
    );
  }
  const active = !ent.expires_date || new Date(ent.expires_date).getTime() > Date.now();
  if (!active) {
    throw new Error(`Granted, but "${ENTITLEMENT}" reads back expired at ${ent.expires_date}.`);
  }

  console.log(
    `Verified: "${ENTITLEMENT}" is active for ${short(appUserId)} ` +
      `(expires: ${ent.expires_date ?? "never"}).`,
  );
  console.log("The reviewer's account can now open Hector, and screenshots need no paywall.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
