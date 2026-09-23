/**
 * Shipaton Day 1: checks whether the Paid Applications Agreement is
 * signed (App Store Connect -> Agreements, Tax, and Banking), and can
 * create the real "Alphonso Pro" subscription group once it is.
 *
 * A prior session tried to check the agreement indirectly and the
 * result was inconclusive (docs/v2-kickoffs/09-revenuecat-and-app-store-
 * launch.md). There is no direct "agreement status" read endpoint in
 * the public App Store Connect API, so this script uses the same
 * indirect method -- attempt a real write (creating the subscription
 * group) -- but prints Apple's full JSON error body on failure instead
 * of just a status code, which is what made the earlier attempt
 * inconclusive.
 *
 * Uses the same App Store Connect API key already configured for
 * ios-release.yml -- no new credentials.
 *
 * Usage:
 *   node_modules/.bin/tsx scripts/check-subscription-status.ts check
 *   node_modules/.bin/tsx scripts/check-subscription-status.ts create-group
 *
 * Requires APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID,
 * APP_STORE_CONNECT_KEY_P8_BASE64 in the environment, and APP_ID
 * (defaults to Learn With Alphonso's known app id, 6813969159).
 */
import { createSign } from "node:crypto";

const KEY_ID = process.env.APP_STORE_CONNECT_KEY_ID;
const ISSUER_ID = process.env.APP_STORE_CONNECT_ISSUER_ID;
const KEY_P8_BASE64 = process.env.APP_STORE_CONNECT_KEY_P8_BASE64;
const APP_ID = process.env.APP_ID ?? "6813969159";

const missing = [
  !KEY_ID && "APP_STORE_CONNECT_KEY_ID",
  !ISSUER_ID && "APP_STORE_CONNECT_ISSUER_ID",
  !KEY_P8_BASE64 && "APP_STORE_CONNECT_KEY_P8_BASE64",
].filter(Boolean);
if (missing.length > 0) {
  console.error(`Missing environment variable(s): ${missing.join(", ")}`);
  process.exit(1);
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input as string)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function makeJWT(): string {
  const privateKey = Buffer.from(KEY_P8_BASE64!, "base64").toString("utf-8");
  const header = { alg: "ES256", kid: KEY_ID, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: ISSUER_ID, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign({ key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${base64url(signature)}`;
}

async function api(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${makeJWT()}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { ok: res.ok, status: res.status, json };
}

async function main() {
  const cmd = process.argv[2];

  console.log(`App id: ${APP_ID}`);
  const app = await api(`/apps/${APP_ID}`);
  if (!app.ok) {
    console.error("Could not fetch app record -- check APP_ID/credentials.");
    console.error(JSON.stringify(app.json, null, 2));
    process.exit(1);
  }
  const appData = app.json as { data: { attributes: { name: string; bundleId: string } } };
  console.log(
    `Confirmed app: ${appData.data.attributes.name} (${appData.data.attributes.bundleId})`,
  );

  console.log("\nExisting subscription groups:");
  const groups = await api(`/apps/${APP_ID}/subscriptionGroups`);
  if (groups.ok) {
    const g = groups.json as { data: { id: string; attributes: { referenceName: string } }[] };
    if (g.data.length === 0) {
      console.log("  (none yet)");
    } else {
      for (const grp of g.data) {
        console.log(`  ${grp.id}  "${grp.attributes.referenceName}"`);
      }
    }
  } else {
    console.log(`  Could not list (status ${groups.status}):`);
    console.log(JSON.stringify(groups.json, null, 2));
  }

  if (cmd === "app-info") {
    // Shipaton Part 2 prep: re-verify category + age rating are still
    // correct via the API rather than trusting prior session notes.
    const appInfos = await api(
      `/apps/${APP_ID}/appInfos?include=ageRatingDeclaration,primaryCategory`,
    );
    console.log(`\nStatus: ${appInfos.status}`);
    console.log(JSON.stringify(appInfos.json, null, 2));
  } else if (cmd === "create-group") {
    console.log('\nAttempting to create subscription group "Alphonso Pro"...');
    const result = await api("/subscriptionGroups", "POST", {
      data: {
        type: "subscriptionGroups",
        attributes: { referenceName: "Alphonso Pro" },
        relationships: { app: { data: { type: "apps", id: APP_ID } } },
      },
    });
    console.log(`Status: ${result.status}`);
    console.log(JSON.stringify(result.json, null, 2));
    if (result.ok) {
      console.log(
        "\n✅ SUCCESS -- Paid Applications Agreement is signed, and the real subscription group now exists.",
      );
    } else {
      console.log(
        "\n❌ FAILED -- read the error body above. If it mentions an unsigned/missing agreement, " +
          "the Paid Applications Agreement needs to be signed in App Store Connect (Agreements, Tax, " +
          "and Banking) before this can succeed -- that step needs the account owner directly.",
      );
    }
  } else {
    console.log('\n(Run with "create-group" instead of "check" to attempt actually creating it.)');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
