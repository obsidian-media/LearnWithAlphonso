/**
 * Read-only: reports the App Store listing screenshots currently attached
 * to the app's editable version, per localization and screenshot-set
 * (device class). Distinct from the SUBSCRIPTION's own review screenshot
 * (scripts/upload-review-screenshot.ts) -- this is what shoppers actually
 * see on the store page.
 *
 * Usage: bunx tsx scripts/check-app-store-screenshots.ts
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

type AscResource = { type: string; id: string; attributes?: Record<string, unknown> };
type JsonApi = { data: AscResource[] | AscResource; errors?: unknown };

async function api(path: string) {
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1${path}`, {
    headers: { Authorization: `Bearer ${makeJWT()}` },
  });
  const json = (await res.json()) as JsonApi;
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  const versions = await api(
    `/apps/${APP_ID}/appStoreVersions?filter[appVersionState]=PREPARE_FOR_SUBMISSION`,
  );
  const version = (versions.data as AscResource[])[0];
  if (!version) throw new Error("No editable appStoreVersion found.");
  console.log(`Version: ${version.attributes?.versionString} (${version.id})`);

  const locs = await api(`/appStoreVersions/${version.id}/appStoreVersionLocalizations`);
  for (const loc of locs.data as AscResource[]) {
    console.log(`\nLocalization: ${loc.attributes?.locale} (${loc.id})`);
    const sets = await api(`/appStoreVersionLocalizations/${loc.id}/appScreenshotSets`);
    const setList = sets.data as AscResource[];
    if (setList.length === 0) {
      console.log("  No screenshot sets at all.");
      continue;
    }
    for (const set of setList) {
      const shots = await api(`/appScreenshotSets/${set.id}/appScreenshots`);
      const shotList = shots.data as AscResource[];
      console.log(`  ${set.attributes?.screenshotDisplayType}: ${shotList.length} screenshot(s)`);
      for (const shot of shotList) {
        const state = (shot.attributes?.assetDeliveryState as { state?: string } | undefined)
          ?.state;
        console.log(`    - ${shot.attributes?.fileName} (${state})`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
