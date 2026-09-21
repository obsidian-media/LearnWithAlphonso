/**
 * Lists (and optionally revokes) this account's iOS code-signing
 * certificates via the App Store Connect API -- built to diagnose and
 * fix the "Choose a certificate to revoke. Your account has reached
 * the maximum number of certificates." error found 2026-09-21 in
 * ios-release.yml's Archive step (see docs/BACKLOG.md's "New blocker"
 * note). Root cause: `-allowProvisioningUpdates` (automatic signing)
 * on a GitHub-hosted runner -- a fresh VM every run, empty keychain --
 * has no way to reuse a previous run's certificate (its private key
 * only ever existed in that run's ephemeral keychain), so Xcode mints
 * a brand-new one on every single release run until the account's cap
 * is hit. This script uses the same App Store Connect API key already
 * configured for automatic signing/TestFlight upload -- no new
 * credentials needed.
 *
 * Usage:
 *   node_modules/.bin/tsx scripts/manage-ios-certificates.ts list
 *   node_modules/.bin/tsx scripts/manage-ios-certificates.ts profiles
 *   node_modules/.bin/tsx scripts/manage-ios-certificates.ts revoke <certificate-id>
 *
 * `list` only shows certificates themselves -- a certificate isn't tied
 * to one app directly, so it can't answer "which app is this for." The
 * provisioning profiles that reference a certificate are what's actually
 * app-specific (each profile names one bundle ID). `profiles` lists every
 * profile with its app and which certificate ID(s) it uses, so a
 * certificate can be matched to a real app (or shown to have zero
 * profiles referencing it at all, meaning it isn't currently used for
 * distributing anything) before deciding what's safe to revoke.
 *
 * Requires APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID,
 * APP_STORE_CONNECT_KEY_P8_BASE64 in the environment (already repo
 * secrets, used by ios-release.yml).
 */
import { createSign } from "node:crypto";

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

/** App Store Connect API auth: a short-lived ES256 JWT signed with the .p8 key. */
function makeJWT(): string {
  const privateKey = Buffer.from(KEY_P8_BASE64!, "base64").toString("utf-8");
  const header = { alg: "ES256", kid: KEY_ID, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: ISSUER_ID, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  // JWS ES256 needs the raw R||S signature format, not the default DER encoding.
  const signature = signer.sign({ key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${base64url(signature)}`;
}

async function api(path: string, method: "GET" | "DELETE" = "GET"): Promise<unknown> {
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${makeJWT()}` },
  });
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

type Certificate = {
  id: string;
  attributes: {
    certificateType: string;
    displayName: string;
    serialNumber: string;
    expirationDate: string;
    name: string;
  };
};

type Profile = {
  id: string;
  attributes: { name: string; profileType: string; uuid: string; expirationDate: string };
  relationships: {
    bundleId: { data: { id: string } | null };
    certificates: { data: { id: string }[] };
  };
};
type BundleId = { id: string; attributes: { identifier: string; name: string } };

async function main() {
  const cmd = process.argv[2];
  if (cmd === "list") {
    const data = (await api("/certificates?limit=200")) as { data: Certificate[] };
    for (const cert of data.data) {
      const a = cert.attributes;
      console.log(
        `${cert.id}  type=${a.certificateType}  name=${a.name}  serial=${a.serialNumber}  expires=${a.expirationDate}`,
      );
    }
    console.log(`\n${data.data.length} certificate(s) total.`);
  } else if (cmd === "profiles") {
    const data = (await api(
      "/profiles?limit=200&include=bundleId,certificates&fields[bundleIds]=identifier,name",
    )) as { data: Profile[]; included?: (BundleId | Certificate)[] };
    const bundleIds = new Map<string, BundleId>();
    const certsById = new Map<string, Certificate>();
    for (const item of data.included ?? []) {
      if ("identifier" in item.attributes) bundleIds.set(item.id, item as BundleId);
      else certsById.set(item.id, item as Certificate);
    }
    for (const profile of data.data) {
      const bundle = profile.relationships.bundleId.data
        ? bundleIds.get(profile.relationships.bundleId.data.id)
        : undefined;
      const certIds = profile.relationships.certificates.data.map((c) => c.id);
      console.log(
        `${profile.id}  name="${profile.attributes.name}"  type=${profile.attributes.profileType}  ` +
          `app=${bundle ? `${bundle.attributes.name} (${bundle.attributes.identifier})` : "UNKNOWN"}  ` +
          `expires=${profile.attributes.expirationDate}  certificates=[${certIds.join(", ")}]`,
      );
    }
    console.log(`\n${data.data.length} profile(s) total.`);

    // Cross-reference: which certificates from the account have NO profile
    // referencing them at all (i.e. not currently used to distribute anything).
    const allCerts = (await api("/certificates?limit=200")) as { data: Certificate[] };
    const referencedCertIds = new Set(
      data.data.flatMap((p) => p.relationships.certificates.data.map((c) => c.id)),
    );
    console.log(
      "\nCertificates with NO provisioning profile referencing them (unused for distribution):",
    );
    for (const cert of allCerts.data) {
      if (!referencedCertIds.has(cert.id)) {
        console.log(
          `  ${cert.id}  type=${cert.attributes.certificateType}  expires=${cert.attributes.expirationDate}`,
        );
      }
    }
  } else if (cmd === "revoke") {
    const id = process.argv[3];
    if (!id) {
      console.error("Usage: revoke <certificate-id>");
      process.exit(1);
    }
    await api(`/certificates/${id}`, "DELETE");
    console.log(`Revoked certificate ${id}`);
  } else {
    console.error("Usage: list | profiles | revoke <certificate-id>");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
