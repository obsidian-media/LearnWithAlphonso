/**
 * One-time setup: generates a NEW iOS Distribution certificate + matching
 * App Store provisioning profile that this repo's own CI controls end to
 * end (the private key is generated right here, on the runner -- it never
 * touches the Apple Developer portal or anyone's local machine), so
 * ios-release.yml can switch from automatic signing
 * (`-allowProvisioningUpdates`) to importing one persisted identity every
 * run instead.
 *
 * Why this is needed: `-allowProvisioningUpdates` on a GitHub-hosted
 * runner -- a fresh VM every run, nothing persists -- has no way to reuse
 * a previous run's certificate (its private key only ever existed in that
 * run's now-destroyed keychain), so every release run has been minting a
 * brand-new certificate instead of reusing one, until the account's
 * certificate cap was hit (see docs/BACKLOG.md's "certificate-limit
 * blocker" entry, found + fixed 2026-09-21). This script is the permanent
 * fix's setup step.
 *
 * Run via .github/workflows/setup-ios-manual-signing.yml (macos-latest --
 * needs `openssl` for key/CSR/PKCS12 work and `security` to read back the
 * provisioning profile's UUID). Writes out/ios_distribution.p12,
 * out/ios_distribution.mobileprovision, and out/p12_password.txt (a
 * freshly generated random password, never printed to logs -- it only
 * ever exists in the file and in memory). This script does NOT set any
 * repo secrets itself -- no token with that scope is passed to CI runs --
 * the workflow uploads these as an artifact instead; download it and add
 * the contents as repo secrets afterward (see this repo's own follow-up
 * for the exact secret names).
 *
 * Requires APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID,
 * APP_STORE_CONNECT_KEY_P8_BASE64 (already repo secrets, same key used
 * for automatic signing/TestFlight upload).
 *
 * Usage: node_modules/.bin/tsx scripts/generate-ios-distribution-signing.ts
 */
import { createSign, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";

const KEY_ID = process.env.APP_STORE_CONNECT_KEY_ID;
const ISSUER_ID = process.env.APP_STORE_CONNECT_ISSUER_ID;
const KEY_P8_BASE64 = process.env.APP_STORE_CONNECT_KEY_P8_BASE64;
const BUNDLE_ID = process.env.BUNDLE_ID || "com.obsidianmedia.learnwithalphonso";

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

type JsonApiResponse = {
  data: {
    id: string;
    attributes: Record<string, unknown>;
  };
};
type JsonApiListResponse = {
  data: { id: string; attributes: Record<string, unknown> }[];
};

async function api(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
): Promise<JsonApiResponse & JsonApiListResponse> {
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${makeJWT()}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<JsonApiResponse & JsonApiListResponse>;
}

async function main() {
  mkdirSync("out", { recursive: true });
  const p12Password = randomBytes(18).toString("base64");
  writeFileSync("out/p12_password.txt", p12Password, "utf-8");

  console.log("Generating a new 2048-bit RSA key + CSR...");
  execFileSync("openssl", ["genrsa", "-out", "out/ios_distribution.key", "2048"]);
  execFileSync("openssl", [
    "req",
    "-new",
    "-key",
    "out/ios_distribution.key",
    "-out",
    "out/ios_distribution.csr",
    "-subj",
    "/CN=LearnWithAlphonso CI Distribution/",
  ]);
  const csrContent = readFileSync("out/ios_distribution.csr", "utf-8");

  // "DISTRIBUTION" (Apple Distribution, the modern universal type covering
  // iOS/macOS/etc) rather than the legacy "IOS_DISTRIBUTION" -- found live
  // via a 409 "You already have a current iOS Distribution certificate or
  // a pending certificate request" when this account already had 3
  // IOS_DISTRIBUTION certs (Apple caps each type separately at a small
  // number). "Apple Distribution" is also the correct CODE_SIGN_IDENTITY
  // value ios-release.yml uses for manual signing either way.
  console.log("Requesting a new Apple Distribution certificate from App Store Connect...");
  const certResp = await api("/certificates", "POST", {
    data: {
      type: "certificates",
      attributes: { csrContent, certificateType: "DISTRIBUTION" },
    },
  });
  const certId = certResp.data.id;
  const certContentBase64 = certResp.data.attributes.certificateContent as string;
  writeFileSync("out/ios_distribution.cer", Buffer.from(certContentBase64, "base64"));
  console.log(`Certificate created: ${certId}`);

  // App Store Connect returns the certificate in DER format -- convert to PEM for pkcs12.
  execFileSync("openssl", [
    "x509",
    "-inform",
    "DER",
    "-in",
    "out/ios_distribution.cer",
    "-out",
    "out/ios_distribution.pem",
  ]);

  console.log("Bundling key + certificate into a .p12...");
  execFileSync("openssl", [
    "pkcs12",
    "-export",
    "-inkey",
    "out/ios_distribution.key",
    "-in",
    "out/ios_distribution.pem",
    "-out",
    "out/ios_distribution.p12",
    "-name",
    "LearnWithAlphonso CI Distribution",
    "-passout",
    `pass:${p12Password}`,
  ]);

  console.log(`Looking up the bundle ID resource for ${BUNDLE_ID}...`);
  const bundleIdResp = await api(`/bundleIds?filter[identifier]=${encodeURIComponent(BUNDLE_ID)}`);
  const bundleIdResource = bundleIdResp.data[0];
  if (!bundleIdResource) throw new Error(`No bundle ID resource found for ${BUNDLE_ID}`);

  console.log("Creating a new App Store provisioning profile...");
  const profileResp = await api("/profiles", "POST", {
    data: {
      type: "profiles",
      attributes: { name: "LearnWithAlphonso CI App Store", profileType: "IOS_APP_STORE" },
      relationships: {
        bundleId: { data: { id: bundleIdResource.id, type: "bundleIds" } },
        certificates: { data: [{ id: certId, type: "certificates" }] },
      },
    },
  });
  const profileContentBase64 = profileResp.data.attributes.profileContent as string;
  writeFileSync(
    "out/ios_distribution.mobileprovision",
    Buffer.from(profileContentBase64, "base64"),
  );
  console.log(`Provisioning profile created: ${profileResp.data.id}`);

  console.log("\nExtracting provisioning profile UUID/name...");
  const plistXml = execFileSync("security", [
    "cms",
    "-D",
    "-i",
    "out/ios_distribution.mobileprovision",
  ]).toString();
  const uuidMatch = plistXml.match(/<key>UUID<\/key>\s*<string>([^<]+)<\/string>/);
  const nameMatch = plistXml.match(/<key>Name<\/key>\s*<string>([^<]+)<\/string>/);
  writeFileSync(
    "out/profile-info.txt",
    `UUID=${uuidMatch?.[1] ?? "UNKNOWN"}\nName=${nameMatch?.[1] ?? "UNKNOWN"}\n`,
    "utf-8",
  );
  console.log(`Profile UUID: ${uuidMatch?.[1]}`);
  console.log(`Profile Name: ${nameMatch?.[1]}`);

  console.log(
    "\nDone. out/ios_distribution.p12, out/ios_distribution.mobileprovision, out/p12_password.txt, " +
      "and out/profile-info.txt are ready to upload as a workflow artifact.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
