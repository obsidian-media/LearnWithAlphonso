/**
 * Writes App Store Connect's Copyright field (appStoreVersions.copyright)
 * and the App Review Information block (appStoreReviewDetail: contact,
 * demo account, notes) from the account-owner-approved values.
 *
 * SAVE ONLY -- both are draft-version PATCHes, the same as typing into the
 * web UI and never pressing "Add for Review." Neither touches
 * appVersionState or calls the submit-for-review endpoint.
 *
 * Copyright: previously left unwritten because the legal entity name was
 * unconfirmed (Obsidian Media is not yet legally registered). Using the
 * account owner's own full legal name instead -- copyright law assigns
 * authorship to the individual by default absent a registered entity to
 * assign it to. This field is plain metadata and can be changed later
 * (e.g. once Obsidian Media incorporates) without a new build or another
 * review cycle.
 *
 * Demo account is passwordless (email-OTP sign-in) -- there is no
 * password to give, so demoAccountPassword explains that instead of
 * being left blank or fabricated.
 *
 * 2026-09-30 audit fix: the demo account's real email and the account
 * owner's real phone number were previously hardcoded directly in this
 * file -- a real PII exposure once committed, since this repository is
 * PUBLIC (grant-demo-entitlement.ts's own header comment already states
 * exactly this reasoning for reading DEMO_ACCOUNT_EMAIL from a secret
 * instead of a workflow input; this file just hadn't followed it). Now
 * read from secrets/env like every other credential-shaped value in
 * this repo. The two already-committed values from before this fix
 * remain in this repo's git history regardless -- that's a separate,
 * account-owner decision (rotate the phone number? scrub history?), not
 * something this fix can undo by itself.
 *
 * Uses the same App Store Connect API key already configured for
 * ios-release.yml -- no new credentials.
 *
 * Modes: "check" (the default) builds and validates the notes, prints their
 * length and the live product title, and writes nothing; "apply" also proves
 * the reviewer sign-in end to end and then saves. The notes text lives in
 * src/lib/app-store/review-notes.ts and the product title is read live from
 * the subscription's localization, so the notes always quote the title the
 * paywall shows.
 *
 * Usage: bunx tsx scripts/update-app-review-info.ts [check|apply]
 * (requires DEMO_ACCOUNT_EMAIL, REVIEW_CONTACT_EMAIL, REVIEW_CONTACT_PHONE,
 * REVIEW_DEMO_CODE_URL, REVIEW_RECORDING_URL in the environment, in addition
 * to the App Store Connect API key trio)
 */
import { createSign } from "node:crypto";
import { editableVersionQuery, pickEditableVersion } from "../src/lib/app-store/editable-version";
import {
  buildReviewNotes,
  reviewNotesProblems,
  type ReviewNotesInput,
} from "../src/lib/app-store/review-notes";

const KEY_ID = process.env.APP_STORE_CONNECT_KEY_ID;
const ISSUER_ID = process.env.APP_STORE_CONNECT_ISSUER_ID;
const KEY_P8_BASE64 = process.env.APP_STORE_CONNECT_KEY_P8_BASE64;
const APP_ID = process.env.APP_ID ?? "6813969159";
const DEMO_ACCOUNT_EMAIL = process.env.DEMO_ACCOUNT_EMAIL;
const REVIEW_CONTACT_EMAIL = process.env.REVIEW_CONTACT_EMAIL;
const REVIEW_CONTACT_PHONE = process.env.REVIEW_CONTACT_PHONE;
// The /api/review-demo-code page URL INCLUDING its secret ?key= -- read
// from a secret, never written here, because this repository is public
// and anyone holding the URL can sign in to the demo account.
const REVIEW_DEMO_CODE_URL = process.env.REVIEW_DEMO_CODE_URL;
// The screen recording of the reviewed flows on a physical device (https link).
const REVIEW_RECORDING_URL = process.env.REVIEW_RECORDING_URL;
const SUBSCRIPTION_ID = process.env.SUBSCRIPTION_ID ?? "6815009725";
const MODE = process.argv[2] === "apply" ? "apply" : "check";

const missing = [
  !KEY_ID && "APP_STORE_CONNECT_KEY_ID",
  !ISSUER_ID && "APP_STORE_CONNECT_ISSUER_ID",
  !KEY_P8_BASE64 && "APP_STORE_CONNECT_KEY_P8_BASE64",
  !DEMO_ACCOUNT_EMAIL && "DEMO_ACCOUNT_EMAIL",
  !REVIEW_CONTACT_EMAIL && "REVIEW_CONTACT_EMAIL",
  !REVIEW_CONTACT_PHONE && "REVIEW_CONTACT_PHONE",
  !REVIEW_DEMO_CODE_URL && "REVIEW_DEMO_CODE_URL",
  !REVIEW_RECORDING_URL && "REVIEW_RECORDING_URL",
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
type JsonApi = { data: AscResource[] | AscResource | null; errors?: unknown };

async function api(path: string, method: "GET" | "PATCH" | "POST" = "GET", body?: unknown) {
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${makeJWT()}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as JsonApi;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

const COPYRIGHT = "2026 Shayan Salimi";

/** The StoreKit product title, read live so the notes can never name a product the paywall does not show. */
async function liveProductTitle(): Promise<string> {
  const locs = await api(`/subscriptions/${SUBSCRIPTION_ID}/subscriptionLocalizations`);
  const en = (locs.data as AscResource[]).find((l) => l.attributes?.locale === "en-US");
  const name = en?.attributes?.name;
  if (typeof name !== "string" || !name) {
    throw new Error("No en-US subscription localization name; cannot quote the StoreKit title.");
  }
  return name;
}

// Public client values, the same ones AppConfig.swift ships in the app.
const SUPABASE_URL = "https://qhcjpfbxfcltjbiuknyt.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_mIBGe0mIBTz---kX-vP59A_x0UhYbs9";

/**
 * Walks the exact steps the review notes tell App Review to follow, and
 * throws unless they end in a real signed-in session: (1) "Send code"
 * (POST /auth/v1/otp, as the app does), (2) open the sign-in code page,
 * (3) "Verify" that code (POST /auth/v1/verify, type "email", as the app
 * does). Runs before anything is written, so notes pointing at a broken or
 * not-yet-deployed page can never reach Apple. Prints nothing secret: no
 * URL, key, code or token.
 */
async function verifyReviewerSignIn(email: string, codePageURL: string) {
  const headers = { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" };

  const sent = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, create_user: false }),
  });
  if (!sent.ok) throw new Error(`Reviewer step 1 (Send code) failed: HTTP ${sent.status}`);

  const page = await fetch(codePageURL, { redirect: "manual" });
  const html = await page.text();
  const code = html.match(/>(\d{6})</)?.[1];
  if (page.status !== 200 || !code) {
    throw new Error(
      `Reviewer step 2 (sign-in code page) failed: HTTP ${page.status}, code found: ${Boolean(code)}. ` +
        "Is REVIEW_DEMO_CODE_KEY set in Vercel production and has production been redeployed since?",
    );
  }

  const verified = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, token: code, type: "email" }),
  });
  const session = (await verified.json().catch(() => ({}))) as {
    access_token?: string;
    user?: { email?: string };
  };
  if (!verified.ok || !session.access_token) {
    throw new Error(`Reviewer step 3 (Verify) failed: HTTP ${verified.status}`);
  }
  if (session.user?.email?.toLowerCase() !== email.toLowerCase()) {
    throw new Error("Reviewer step 3 signed in as a different account than DEMO_ACCOUNT_EMAIL.");
  }
  console.log("Reviewer sign-in verified end to end: Send code -> code page -> Verify -> session.");
}

async function main() {
  // Sending a code and opening the code page issue a real code, so the end-to-end sign-in proof
  // runs only when about to write. A check run stays read-only.
  if (MODE === "apply") await verifyReviewerSignIn(DEMO_ACCOUNT_EMAIL!, REVIEW_DEMO_CODE_URL!);

  console.log(`\nFinding the app's editable App Store version...`);
  const versions = await api(`/apps/${APP_ID}/appStoreVersions?${editableVersionQuery()}`);
  const version = pickEditableVersion(versions.data as AscResource[]);
  console.log(
    `Version: ${version.attributes?.versionString} (${version.attributes?.appVersionState}, ${version.id})`,
  );

  const productTitle = await liveProductTitle();
  const notesInput: ReviewNotesInput = {
    demoAccountEmail: DEMO_ACCOUNT_EMAIL!,
    reviewContactEmail: REVIEW_CONTACT_EMAIL!,
    demoCodeURL: REVIEW_DEMO_CODE_URL!,
    recordingURL: REVIEW_RECORDING_URL!,
    productTitle,
  };
  const notes = buildReviewNotes(notesInput);
  const problems = reviewNotesProblems(notes, notesInput);
  if (problems.length > 0) throw new Error(`Review notes have problems: ${problems.join("; ")}`);
  console.log(`Product title (live): ${productTitle}`);
  console.log(`Review notes length: ${notes.length}/4000`);
  if (MODE !== "apply") {
    console.log('\nCheck only: nothing written. Run with "apply" to save.');
    return;
  }

  console.log(`\nCurrent copyright: ${version.attributes?.copyright ?? "(empty)"}`);
  console.log(`Writing copyright: ${COPYRIGHT}`);
  const updatedVersion = await api(`/appStoreVersions/${version.id}`, "PATCH", {
    data: { type: "appStoreVersions", id: version.id, attributes: { copyright: COPYRIGHT } },
  });
  const actualCopyright = (updatedVersion.data as AscResource).attributes?.copyright;
  console.log(
    actualCopyright === COPYRIGHT ? "Copyright: OK" : `Copyright: MISMATCH (${actualCopyright})`,
  );

  console.log(`\nFinding its App Review Information...`);
  const existing = await api(`/appStoreVersions/${version.id}/appStoreReviewDetail`);
  const reviewAttributes = {
    contactFirstName: "Shayan",
    contactLastName: "Salimi",
    contactEmail: REVIEW_CONTACT_EMAIL!,
    contactPhone: REVIEW_CONTACT_PHONE!,
    demoAccountName: DEMO_ACCOUNT_EMAIL!,
    demoAccountPassword: "No password. Tap Send code, then open the code page in the notes.",
    demoAccountRequired: true,
    notes,
  };

  // App Store Connect caps the demo password field at 100 characters
  // (a 409 TOO_LONG, found live) and review notes at 4000.
  if (reviewAttributes.demoAccountPassword.length > 100) {
    throw new Error(
      `demoAccountPassword is ${reviewAttributes.demoAccountPassword.length} chars; the limit is 100.`,
    );
  }
  // App Store Connect caps review notes at 4000 characters.
  if (reviewAttributes.notes.length > 4000) {
    throw new Error(`Review notes are ${reviewAttributes.notes.length} chars; the limit is 4000.`);
  }

  let updatedDetail: JsonApi;
  if (existing.data) {
    const detailId = (existing.data as AscResource).id;
    console.log(`Existing appStoreReviewDetail ${detailId} -- updating via PATCH.`);
    updatedDetail = await api(`/appStoreReviewDetails/${detailId}`, "PATCH", {
      data: { type: "appStoreReviewDetails", id: detailId, attributes: reviewAttributes },
    });
  } else {
    console.log(`No appStoreReviewDetail yet -- creating via POST.`);
    updatedDetail = await api(`/appStoreReviewDetails`, "POST", {
      data: {
        type: "appStoreReviewDetails",
        attributes: reviewAttributes,
        relationships: {
          appStoreVersion: { data: { type: "appStoreVersions", id: version.id } },
        },
      },
    });
  }

  const savedAttrs = (updatedDetail.data as AscResource).attributes ?? {};
  console.log(`\nRead back after write, to confirm each field actually stuck:`);
  let allMatch = true;
  for (const [key, expected] of Object.entries(reviewAttributes)) {
    const actual = savedAttrs[key];
    const matches = actual === expected;
    allMatch = allMatch && matches;
    console.log(`  ${key}: ${matches ? "OK" : "MISMATCH"}`);
  }

  console.log(
    allMatch
      ? "\nAll fields confirmed saved. Nothing was submitted -- this is still a draft."
      : "\nSome fields did not match after write -- check the mismatches above.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
