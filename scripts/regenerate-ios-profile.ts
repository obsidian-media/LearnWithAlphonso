/**
 * Regenerates ONLY the App Store provisioning profile, reusing the
 * distribution certificate that already exists.
 *
 * **Why this exists separately from
 * `generate-ios-distribution-signing.ts`.** That script mints a new
 * certificate *and* a new profile, which is right for first-time setup and
 * wrong here: Apple caps distribution certificates per type, and asking for
 * another returns `409 ENTITY_ERROR: You already have a current
 * Distribution certificate or a pending certificate request`. Running it to
 * fix a profile problem therefore fails, and the only way to make it
 * succeed would be revoking the certificate CI currently signs with --
 * breaking every release until four secrets are rotated.
 *
 * **The problem it actually solves.** A provisioning profile pins the
 * capabilities the App ID had *when the profile was created*. Adding a new
 * entitlement to the app -- `com.apple.developer.applesignin`, say -- does
 * not update the existing profile, so the archive fails with
 * "Provisioning profile ... doesn't include the Sign In with Apple
 * capability" even though the App ID now has it. Nothing in CI catches
 * this: `ios-app-build` compiles for the simulator with
 * `CODE_SIGNING_ALLOWED=NO`, so signing is never exercised until a real
 * release run.
 *
 * Enable the capability on the App ID in the Developer portal FIRST. This
 * script reads whatever the App ID currently has; it cannot add anything.
 *
 * Only two secrets change afterwards -- `IOS_PROVISIONING_PROFILE_BASE64`
 * and `IOS_PROVISIONING_PROFILE_UUID`. The certificate and its password are
 * untouched, which is the point.
 *
 * Usage: bunx tsx scripts/regenerate-ios-profile.ts
 */
import { execFileSync } from "node:child_process";
import { createSign } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const KEY_ID = process.env.APP_STORE_CONNECT_KEY_ID;
const ISSUER_ID = process.env.APP_STORE_CONNECT_ISSUER_ID;
const KEY_P8_BASE64 = process.env.APP_STORE_CONNECT_KEY_P8_BASE64;
const BUNDLE_ID = process.env.BUNDLE_ID || "com.obsidianmedia.learnwithalphonso";

const missing = [
  ["APP_STORE_CONNECT_KEY_ID", KEY_ID],
  ["APP_STORE_CONNECT_ISSUER_ID", ISSUER_ID],
  ["APP_STORE_CONNECT_KEY_P8_BASE64", KEY_P8_BASE64],
]
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length) {
  console.error(`Missing environment variable(s): ${missing.join(", ")}`);
  process.exit(1);
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** ES256, same shape App Store Connect requires everywhere else. */
function makeJWT(): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: KEY_ID, typ: "JWT" };
  const payload = { iss: ISSUER_ID, iat: now, exp: now + 600, aud: "appstoreconnect-v1" };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const privateKey = Buffer.from(KEY_P8_BASE64!, "base64").toString("utf-8");
  const signature = createSign("SHA256")
    .update(signingInput)
    .sign({ key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${base64url(signature)}`;
}

/** App Store Connect is JSON:API; only the few fields used here are read. */
type AscResource = { id: string; attributes?: Record<string, unknown> };
type JsonApi = { data: AscResource[] & AscResource; errors?: unknown };

async function api(path: string, method: "GET" | "POST" | "DELETE" = "GET", body?: unknown) {
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${makeJWT()}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${await res.text()}`);
  // DELETE answers 204 with no body.
  return res.status === 204 ? ({ data: null } as JsonApi) : ((await res.json()) as JsonApi);
}

async function main() {
  mkdirSync("out", { recursive: true });

  console.log("Finding the existing Apple Distribution certificate...");
  const certs = await api("/certificates?filter[certificateType]=DISTRIBUTION&limit=200");
  const valid = (certs.data as unknown as AscResource[]).filter((c) => {
    const expiry = c.attributes?.expirationDate as string | undefined;
    return !expiry || new Date(expiry) > new Date();
  });
  if (valid.length === 0) {
    throw new Error(
      "No unexpired DISTRIBUTION certificate exists. This script only reuses one -- " +
        "run setup-ios-manual-signing.yml to mint a certificate first.",
    );
  }
  // Newest wins if the account somehow holds several.
  valid.sort(
    (a, b) =>
      new Date((b.attributes?.expirationDate as string) ?? 0).getTime() -
      new Date((a.attributes?.expirationDate as string) ?? 0).getTime(),
  );
  const cert = valid[0];
  console.log(
    `Reusing certificate ${cert.id} (${cert.attributes?.name ?? "unnamed"}), ` +
      `expires ${cert.attributes?.expirationDate ?? "unknown"}`,
  );

  console.log(`Looking up the bundle ID resource for ${BUNDLE_ID}...`);
  const bundleIdResp = await api(`/bundleIds?filter[identifier]=${encodeURIComponent(BUNDLE_ID)}`);
  const bundleIdResource = (bundleIdResp.data as unknown as AscResource[])[0];
  if (!bundleIdResource) throw new Error(`No bundle ID resource found for ${BUNDLE_ID}`);

  // Apple rejects a second profile with the same name, so retire the old
  // one first. Safe: the profile in CI's secrets is a downloaded copy, and
  // a fresh one replaces it in the same run.
  console.log("Removing any existing CI App Store profile with the same name...");
  const existing = await api("/profiles?filter[profileType]=IOS_APP_STORE&limit=200");
  for (const p of existing.data as unknown as AscResource[]) {
    if (
      typeof p.attributes?.name === "string" &&
      (p.attributes.name as string).startsWith("LearnWithAlphonso CI App Store")
    ) {
      await api(`/profiles/${p.id}`, "DELETE");
      console.log(`  deleted ${String(p.attributes?.name)} (${p.id})`);
    }
  }

  // The name carries a timestamp so a stale profile is identifiable at a
  // glance in the portal, matching the existing convention.
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
  const name = `LearnWithAlphonso CI App Store ${stamp}`;
  console.log(`Creating provisioning profile "${name}"...`);
  const profileResp = await api("/profiles", "POST", {
    data: {
      type: "profiles",
      attributes: { name, profileType: "IOS_APP_STORE" },
      relationships: {
        bundleId: { data: { id: bundleIdResource.id, type: "bundleIds" } },
        certificates: { data: [{ id: cert.id, type: "certificates" }] },
      },
    },
  });

  const profileContentBase64 = profileResp.data.attributes?.profileContent as string;
  writeFileSync(
    "out/ios_distribution.mobileprovision",
    Buffer.from(profileContentBase64, "base64"),
  );

  const plistXml = execFileSync("security", [
    "cms",
    "-D",
    "-i",
    "out/ios_distribution.mobileprovision",
  ]).toString();
  const uuid = plistXml.match(/<key>UUID<\/key>\s*<string>([^<]+)<\/string>/)?.[1] ?? "UNKNOWN";

  // Proof the capability actually made it in. Without this the script can
  // "succeed" and hand back a profile that fails the archive exactly as
  // before -- the whole reason this run exists.
  const hasAppleSignIn = plistXml.includes("com.apple.developer.applesignin");
  console.log(`\nSign in with Apple entitlement present in profile: ${hasAppleSignIn}`);
  if (!hasAppleSignIn) {
    console.error(
      "\nThe new profile does NOT carry com.apple.developer.applesignin.\n" +
        "That means the capability is not enabled on the App ID itself. Enable it at\n" +
        "developer.apple.com -> Identifiers -> " +
        BUNDLE_ID +
        " -> Sign in with Apple -> Save,\nthen run this again. A profile cannot add a capability the App ID lacks.",
    );
    process.exit(1);
  }

  writeFileSync("out/profile-info.txt", `UUID=${uuid}\nName=${name}\n`, "utf-8");
  console.log(`Profile UUID: ${uuid}`);
  console.log(
    "\nDone. Update these two repo secrets from the artifact:\n" +
      "  IOS_PROVISIONING_PROFILE_BASE64  <- base64 of ios_distribution.mobileprovision\n" +
      "  IOS_PROVISIONING_PROFILE_UUID    <- the UUID above\n" +
      "The certificate secrets are unchanged.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
