/**
 * Read-only inventory of the Apple signing identities this app depends on.
 *
 * Lists every certificate and provisioning profile on the Apple Developer
 * account through the App Store Connect API, printing only public
 * identifiers: resource id, name, type, serial number, state and expiry.
 * It never creates, revokes or downloads anything, and never prints key
 * material.
 *
 * Run by .github/workflows/ios-signing-inventory.yml, which then reports
 * which certificate and profiles the repo's signing secrets actually hold,
 * so a rotation can name the exact certificate to revoke.
 *
 * Requires APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID and
 * APP_STORE_CONNECT_KEY_P8_BASE64.
 *
 * Usage: bun scripts/ios-signing-inventory.ts
 */
import { createSign } from "node:crypto";

const KEY_ID = process.env.APP_STORE_CONNECT_KEY_ID;
const ISSUER_ID = process.env.APP_STORE_CONNECT_ISSUER_ID;
const KEY_P8_BASE64 = process.env.APP_STORE_CONNECT_KEY_P8_BASE64;

if (!KEY_ID || !ISSUER_ID || !KEY_P8_BASE64) {
  console.error(
    "Missing APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID or APP_STORE_CONNECT_KEY_P8_BASE64.",
  );
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
  const payload = { iss: ISSUER_ID, iat: now, exp: now + 600, aud: "appstoreconnect-v1" };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign({ key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${base64url(signature)}`;
}

type Resource = {
  id: string;
  attributes: Record<string, unknown>;
  relationships?: Record<string, { data?: { id: string }[] | { id: string } }>;
};

async function get(path: string): Promise<{ data: Resource[] }> {
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1${path}`, {
    headers: { Authorization: `Bearer ${makeJWT()}` },
  });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}: ${await res.text()}`);
  return res.json() as Promise<{ data: Resource[] }>;
}

const day = (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : "-");

async function main() {
  const certs = await get(
    "/certificates?limit=200&fields[certificates]=name,displayName,certificateType,serialNumber,platform,expirationDate",
  );
  console.log(`\n=== Certificates on the Apple account (${certs.data.length}) ===`);
  console.log("id | type | name | serial | expires");
  for (const c of certs.data) {
    const a = c.attributes;
    console.log(
      [
        c.id,
        a.certificateType,
        a.displayName ?? a.name,
        a.serialNumber,
        day(a.expirationDate),
      ].join(" | "),
    );
  }

  const profiles = await get(
    "/profiles?limit=200&fields[profiles]=name,profileType,profileState,uuid,expirationDate,certificates,bundleId&include=certificates",
  );
  console.log(`\n=== Provisioning profiles (${profiles.data.length}) ===`);
  console.log("id | name | type | state | uuid | expires | certificate ids");
  for (const p of profiles.data) {
    const a = p.attributes;
    const rel = p.relationships?.certificates?.data;
    const certIds = Array.isArray(rel) ? rel.map((r) => r.id).join(",") : "-";
    console.log(
      [p.id, a.name, a.profileType, a.profileState, a.uuid, day(a.expirationDate), certIds].join(
        " | ",
      ),
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
