/**
 * Shipaton Day 1 (continued): creates the real "Alphonso Pro Monthly"
 * subscription product inside the "Alphonso Pro" subscription group
 * (id 22405850, created 2026-09-22 via check-subscription-status.ts
 * create-group -- see docs/BACKLOG.md's §1.1 and
 * D:\AgentDevWork\repos\Hackaton\Shipaton\02-launch-checklist\
 * execution-record.md for the full paper trail).
 *
 * Each subcommand is a separate real App Store Connect API write, run
 * one at a time on purpose -- a subscription can't be priced or
 * localized until it exists, and every step's exact response is worth
 * reading before firing the next one rather than chaining them blind.
 *
 * Uses the same App Store Connect API key already configured for
 * ios-release.yml -- no new credentials.
 *
 * Usage (run in this order):
 *   tsx scripts/create-subscription-product.ts create-subscription
 *   tsx scripts/create-subscription-product.ts create-localization <subscriptionId>
 *   tsx scripts/create-subscription-product.ts list-price-points <subscriptionId>
 *   tsx scripts/create-subscription-product.ts set-price <subscriptionId> <pricePointId>
 *   tsx scripts/create-subscription-product.ts status <subscriptionId>
 *
 * Requires APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID,
 * APP_STORE_CONNECT_KEY_P8_BASE64 in the environment.
 */
import { createSign } from "node:crypto";

const KEY_ID = process.env.APP_STORE_CONNECT_KEY_ID;
const ISSUER_ID = process.env.APP_STORE_CONNECT_ISSUER_ID;
const KEY_P8_BASE64 = process.env.APP_STORE_CONNECT_KEY_P8_BASE64;

const GROUP_ID = process.env.SUBSCRIPTION_GROUP_ID ?? "22405850";
const PRODUCT_ID =
  process.env.SUBSCRIPTION_PRODUCT_ID ?? "com.obsidianmedia.learnwithalphonso.pro.monthly";
const REFERENCE_NAME = "Alphonso Pro Monthly";
const DISPLAY_NAME = "Alphonso Pro";
const DESCRIPTION = "Unlock Hector, your AI conversation tutor, for real practice.";
const TARGET_PRICE_USD = "9.99";

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
  method: "GET" | "POST" | "PATCH" = "GET",
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

function printResult(label: string, result: { ok: boolean; status: number; json: unknown }) {
  console.log(`\n=== ${label} ===`);
  console.log(`Status: ${result.status}`);
  console.log(JSON.stringify(result.json, null, 2));
  console.log(result.ok ? "✅ OK" : "❌ FAILED");
}

async function main() {
  const cmd = process.argv[2];

  if (cmd === "create-subscription") {
    const result = await api("/subscriptions", "POST", {
      data: {
        type: "subscriptions",
        attributes: {
          name: REFERENCE_NAME,
          productId: PRODUCT_ID,
          subscriptionPeriod: "ONE_MONTH",
          groupLevel: 1,
          familySharable: false,
        },
        relationships: {
          group: { data: { type: "subscriptionGroups", id: GROUP_ID } },
        },
      },
    });
    printResult(`create-subscription (product id ${PRODUCT_ID})`, result);
    if (result.ok) {
      const data = result.json as { data: { id: string } };
      console.log(`\nSubscription id: ${data.data.id}`);
      console.log("Next: create-localization, then list-price-points, then set-price.");
    }
  } else if (cmd === "create-localization") {
    const subId = process.argv[3];
    if (!subId) {
      console.error("Usage: create-localization <subscriptionId>");
      process.exit(1);
    }
    const result = await api("/subscriptionLocalizations", "POST", {
      data: {
        type: "subscriptionLocalizations",
        attributes: { name: DISPLAY_NAME, description: DESCRIPTION, locale: "en-US" },
        relationships: {
          subscription: { data: { type: "subscriptions", id: subId } },
        },
      },
    });
    printResult(`create-localization (en-US, subscription ${subId})`, result);
  } else if (cmd === "list-price-points") {
    const subId = process.argv[3];
    if (!subId) {
      console.error("Usage: list-price-points <subscriptionId>");
      process.exit(1);
    }
    const result = await api(
      `/subscriptions/${subId}/pricePoints?filter[territory]=USA&limit=200`,
    );
    if (result.ok) {
      const data = result.json as {
        data: { id: string; attributes: { customerPrice: string; proceeds: string } }[];
      };
      console.log(`\n${data.data.length} USA price point(s). Looking for $${TARGET_PRICE_USD}:`);
      for (const pp of data.data) {
        const match = pp.attributes.customerPrice === TARGET_PRICE_USD ? "  <-- MATCH" : "";
        console.log(
          `  ${pp.id}  customerPrice=${pp.attributes.customerPrice}  proceeds=${pp.attributes.proceeds}${match}`,
        );
      }
    } else {
      printResult("list-price-points", result);
    }
  } else if (cmd === "set-price") {
    const subId = process.argv[3];
    const pricePointId = process.argv[4];
    if (!subId || !pricePointId) {
      console.error("Usage: set-price <subscriptionId> <pricePointId>");
      process.exit(1);
    }
    const result = await api("/subscriptionPrices", "POST", {
      data: {
        type: "subscriptionPrices",
        attributes: { preserveCurrentPrice: false },
        relationships: {
          subscription: { data: { type: "subscriptions", id: subId } },
          subscriptionPricePoint: { data: { type: "subscriptionPricePoints", id: pricePointId } },
        },
      },
    });
    printResult(`set-price (subscription ${subId}, price point ${pricePointId})`, result);
  } else if (cmd === "status") {
    const subId = process.argv[3];
    if (!subId) {
      console.error("Usage: status <subscriptionId>");
      process.exit(1);
    }
    const result = await api(
      `/subscriptions/${subId}?include=subscriptionLocalizations,prices&fields[subscriptions]=name,productId,subscriptionPeriod,state,groupLevel`,
    );
    printResult(`status (subscription ${subId})`, result);
  } else {
    console.error(
      "Usage: create-subscription | create-localization <id> | list-price-points <id> | set-price <id> <pricePointId> | status <id>",
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
