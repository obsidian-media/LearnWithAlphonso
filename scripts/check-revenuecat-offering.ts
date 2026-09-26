/**
 * Read-only: asks RevenueCat for the offerings the app itself would see,
 * using the same endpoint and the same PUBLIC SDK key the iOS client
 * uses. Changes nothing.
 *
 * **Why this exists.** `EntitlementStore.loadOffering()` renders the
 * paywall from `offerings.current?.availablePackages`. If RevenueCat has
 * no *current* offering, or that offering has no packages, the paywall
 * is empty -- and the app shows "can't load options" exactly as it
 * would if Apple had not yet approved the subscription. Those two
 * causes look identical from the device and have completely different
 * fixes, so guessing between them wastes a review cycle.
 * `EntitlementStore.swift`'s own comment says there is "no real offering
 * configured yet"; this answers whether that is still true, without
 * anyone reading a dashboard and reporting back.
 *
 * Uses REVENUECAT_API_KEY -- the PUBLIC SDK key that already ships
 * inside the app (Info.plist), not the secret key. A public key is all
 * this endpoint takes, and using the secret one here would be handing
 * a read-only check far more authority than it needs.
 *
 * Usage: dispatch .github/workflows/check-revenuecat-offering.yml
 */
const API_KEY = process.env.REVENUECAT_API_KEY;
const APP_USER_ID = process.env.APP_USER_ID || "offering-probe";
const EXPECTED_PRODUCT =
  process.env.EXPECTED_PRODUCT_ID || "com.obsidianmedia.learnwithalphonso.pro.monthly";

if (!API_KEY) {
  console.error("Missing REVENUECAT_API_KEY (the public SDK key).");
  process.exit(1);
}

type Package = { identifier?: string; platform_product_identifier?: string };
type Offering = { identifier?: string; packages?: Package[] };
type OfferingsResponse = { current_offering_id?: string | null; offerings?: Offering[] };

async function main() {
  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(APP_USER_ID)}/offerings`,
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        // The SDK sends this; without it RevenueCat cannot decide which
        // store's products to resolve.
        "X-Platform": "ios",
      },
    },
  );
  if (!res.ok) {
    console.error(`offerings -> ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const body = (await res.json()) as OfferingsResponse;
  const offerings = body.offerings ?? [];
  const currentId = body.current_offering_id ?? null;

  console.log(`current_offering_id: ${currentId ?? "(none)"}`);
  console.log(`offerings defined:   ${offerings.length}`);
  for (const o of offerings) {
    const pkgs = o.packages ?? [];
    console.log(`  - ${o.identifier} (${pkgs.length} package(s))`);
    for (const p of pkgs) {
      console.log(`      ${p.identifier} -> ${p.platform_product_identifier}`);
    }
  }
  console.log("");

  // The two failures that produce an identical empty paywall, separated.
  if (!currentId) {
    console.error(
      "NO CURRENT OFFERING. The paywall will be empty regardless of whether\n" +
        "Apple has approved the subscription -- RevenueCat has nothing to show.\n" +
        "Fix in the RevenueCat dashboard: Offerings -> mark one Current.",
    );
    process.exit(1);
  }
  const current = offerings.find((o) => o.identifier === currentId);
  const products = (current?.packages ?? [])
    .map((p) => p.platform_product_identifier)
    .filter((x): x is string => Boolean(x));

  if (products.length === 0) {
    console.error(
      `Current offering "${currentId}" has NO packages. Same empty paywall,\n` +
        "different cause: the offering exists but nothing is attached to it.",
    );
    process.exit(1);
  }
  if (!products.includes(EXPECTED_PRODUCT)) {
    console.error(
      `Current offering "${currentId}" does not contain ${EXPECTED_PRODUCT}.\n` +
        `It contains: ${products.join(", ")}\n` +
        "A product id that differs by one character is a silently empty paywall.",
    );
    process.exit(1);
  }

  console.log(`OK: current offering "${currentId}" contains ${EXPECTED_PRODUCT}.`);
  console.log(
    "Note this does NOT prove the paywall renders: until Apple approves a\n" +
      "FIRST auto-renewable subscription, StoreKit cannot price it and the\n" +
      "packages stay unpurchasable. This only rules out the RevenueCat half.",
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
