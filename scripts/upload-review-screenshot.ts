/**
 * Shipaton: uploads the App Store Review Screenshot for a subscription --
 * the real image, approved by the account owner, lives at
 * .github/scratch/review-screenshot.png (checked into a throwaway branch
 * just for this one CI run, removed afterward).
 *
 * Apple's asset-upload pattern (same shape as build/screenshot uploads
 * elsewhere in App Store Connect): reserve the resource (get back one or
 * more signed upload URLs + byte ranges), PUT the file bytes to each
 * range, then PATCH the resource with uploaded:true and an MD5 checksum
 * to finalize it.
 *
 * Usage:
 *   tsx scripts/upload-review-screenshot.ts <subscriptionId> <imagePath>
 *
 * Requires APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID,
 * APP_STORE_CONNECT_KEY_P8_BASE64 in the environment.
 */
import { createSign, createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

const KEY_ID = process.env.APP_STORE_CONNECT_KEY_ID;
const ISSUER_ID = process.env.APP_STORE_CONNECT_ISSUER_ID;
const KEY_P8_BASE64 = process.env.APP_STORE_CONNECT_KEY_P8_BASE64;

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

type UploadOperation = {
  method: string;
  url: string;
  requestHeaders: { name: string; value: string }[];
  offset: number;
  length: number;
};

async function main() {
  const subId = process.argv[2];
  const imagePath = process.argv[3];
  if (!subId || !imagePath) {
    console.error("Usage: upload-review-screenshot.ts <subscriptionId> <imagePath>");
    process.exit(1);
  }

  const fileBuffer = readFileSync(imagePath);
  const fileSize = statSync(imagePath).size;
  const fileName = imagePath.split("/").pop()!;
  console.log(`File: ${fileName}, ${fileSize} bytes`);

  console.log("\n=== Step 1: reserve the appStoreReviewScreenshot resource ===");
  const reserve = await api("/appStoreReviewScreenshots", "POST", {
    data: {
      type: "appStoreReviewScreenshots",
      attributes: { fileName, fileSize },
      relationships: {
        subscription: { data: { type: "subscriptions", id: subId } },
      },
    },
  });
  console.log(`Status: ${reserve.status}`);
  console.log(JSON.stringify(reserve.json, null, 2));
  if (!reserve.ok) {
    console.log("\n❌ FAILED at reserve step.");
    process.exit(1);
  }
  const reserveData = reserve.json as {
    data: { id: string; attributes: { uploadOperations: UploadOperation[] } };
  };
  const screenshotId = reserveData.data.id;
  const uploadOperations = reserveData.data.attributes.uploadOperations;
  console.log(`\nScreenshot id: ${screenshotId}`);
  console.log(`${uploadOperations.length} upload operation(s).`);

  console.log("\n=== Step 2: PUT file bytes to each upload operation ===");
  for (const op of uploadOperations) {
    const chunk = fileBuffer.subarray(op.offset, op.offset + op.length);
    const headers: Record<string, string> = {};
    for (const h of op.requestHeaders) headers[h.name] = h.value;
    const res = await fetch(op.url, { method: op.method, headers, body: chunk });
    console.log(
      `PUT offset=${op.offset} length=${op.length} -> ${res.status} ${res.statusText}`,
    );
    if (!res.ok) {
      console.log("❌ FAILED at upload step.");
      console.log(await res.text());
      process.exit(1);
    }
  }

  console.log("\n=== Step 3: PATCH to mark uploaded, with checksum ===");
  const checksum = createHash("md5").update(fileBuffer).digest("hex");
  console.log(`MD5 checksum: ${checksum}`);
  const finalize = await api(`/appStoreReviewScreenshots/${screenshotId}`, "PATCH", {
    data: {
      type: "appStoreReviewScreenshots",
      id: screenshotId,
      attributes: { uploaded: true, sourceFileChecksum: checksum },
    },
  });
  console.log(`Status: ${finalize.status}`);
  console.log(JSON.stringify(finalize.json, null, 2));
  if (finalize.ok) {
    console.log("\n✅ SUCCESS -- App Store Review Screenshot uploaded and finalized.");
  } else {
    console.log("\n❌ FAILED at finalize step.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
