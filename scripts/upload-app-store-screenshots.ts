/**
 * Uploads a directory of App Store listing screenshots (distinct from
 * the subscription's own review screenshot -- see
 * upload-review-screenshot.ts) to the app's current editable version,
 * en-US localization.
 *
 * Same reserve -> PUT bytes -> finalize pattern as
 * upload-review-screenshot.ts. Creates the appScreenshotSet for the
 * target display type if it doesn't exist yet.
 *
 * The exact `screenshotDisplayType` enum value for the 6.9"/6.7"
 * iPhone class has changed across Apple API versions and this script
 * cannot know for certain which string this account's API version
 * expects -- it tries the historical value first (APP_IPHONE_67, which
 * has covered the largest iPhone slot including 6.9" devices like the
 * iPhone 17 Pro Max) and if Apple rejects it, prints the full error
 * body (which typically lists the accepted enum values) and stops
 * rather than guessing further.
 *
 * Usage:
 *   bunx tsx scripts/upload-app-store-screenshots.ts <directory-of-pngs>
 */
import { createSign, createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const KEY_ID = process.env.APP_STORE_CONNECT_KEY_ID;
const ISSUER_ID = process.env.APP_STORE_CONNECT_ISSUER_ID;
const KEY_P8_BASE64 = process.env.APP_STORE_CONNECT_KEY_P8_BASE64;
const APP_ID = process.env.APP_ID ?? "6813969159";
const DISPLAY_TYPE = process.env.SCREENSHOT_DISPLAY_TYPE ?? "APP_IPHONE_67";

const missing = [
  !KEY_ID && "APP_STORE_CONNECT_KEY_ID",
  !ISSUER_ID && "APP_STORE_CONNECT_ISSUER_ID",
  !KEY_P8_BASE64 && "APP_STORE_CONNECT_KEY_P8_BASE64",
].filter(Boolean);
if (missing.length > 0) {
  console.error(`Missing environment variable(s): ${missing.join(", ")}`);
  process.exit(1);
}

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: bunx tsx scripts/upload-app-store-screenshots.ts <directory-of-pngs>");
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
type JsonApi = { data: AscResource[] | AscResource | null; errors?: unknown };

async function api(path: string, method: "GET" | "POST" | "PATCH" = "GET", body?: unknown) {
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${makeJWT()}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as JsonApi;
  if (!res.ok)
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json, null, 2)}`);
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
  const loc = (locs.data as AscResource[]).find((l) => l.attributes?.locale === "en-US");
  if (!loc) throw new Error("No en-US localization found.");
  console.log(`Localization: ${loc.id}`);

  console.log(`Finding or creating the "${DISPLAY_TYPE}" screenshot set...`);
  const existingSets = await api(`/appStoreVersionLocalizations/${loc.id}/appScreenshotSets`);
  let set = (existingSets.data as AscResource[]).find(
    (s) => s.attributes?.screenshotDisplayType === DISPLAY_TYPE,
  );
  if (set) {
    console.log(`Existing set ${set.id}.`);
  } else {
    const created = await api("/appScreenshotSets", "POST", {
      data: {
        type: "appScreenshotSets",
        attributes: { screenshotDisplayType: DISPLAY_TYPE },
        relationships: {
          appStoreVersionLocalization: {
            data: { type: "appStoreVersionLocalizations", id: loc.id },
          },
        },
      },
    });
    set = created.data as AscResource;
    console.log(`Created set ${set.id}.`);
  }

  const files = readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".png"))
    .sort();
  console.log(`\n${files.length} screenshot(s) to upload: ${files.join(", ")}`);

  for (const fileName of files) {
    const filePath = join(dir, fileName);
    const fileData = readFileSync(filePath);
    const fileSize = statSync(filePath).size;
    console.log(`\n--- ${fileName} (${fileSize} bytes) ---`);

    const reserved = await api(`/appScreenshots`, "POST", {
      data: {
        type: "appScreenshots",
        attributes: { fileName, fileSize },
        relationships: {
          appScreenshotSet: { data: { type: "appScreenshotSets", id: set!.id } },
        },
      },
    });
    const shot = reserved.data as AscResource;
    const uploadOps = shot.attributes?.uploadOperations as
      | {
          method: string;
          url: string;
          requestHeaders: { name: string; value: string }[];
          offset: number;
          length: number;
        }[]
      | undefined;
    if (!uploadOps) throw new Error(`No uploadOperations returned for ${fileName}`);

    for (const op of uploadOps) {
      const headers: Record<string, string> = {};
      for (const h of op.requestHeaders) headers[h.name] = h.value;
      const chunk = fileData.subarray(op.offset, op.offset + op.length);
      const putRes = await fetch(op.url, { method: op.method, headers, body: chunk });
      if (!putRes.ok)
        throw new Error(`PUT failed for ${fileName}: ${putRes.status} ${await putRes.text()}`);
    }

    const checksum = createHash("md5").update(fileData).digest("hex");
    const finalized = await api(`/appScreenshots/${shot.id}`, "PATCH", {
      data: {
        type: "appScreenshots",
        id: shot.id,
        attributes: { uploaded: true, sourceFileChecksum: checksum },
      },
    });
    const state = (
      (finalized.data as AscResource).attributes?.assetDeliveryState as
        { state?: string } | undefined
    )?.state;
    console.log(`Finalized: ${state}`);
  }

  console.log("\nDone. Nothing was submitted -- these are still a draft version's assets.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
