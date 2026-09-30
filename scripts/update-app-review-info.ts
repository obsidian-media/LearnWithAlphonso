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
 * Usage: bunx tsx scripts/update-app-review-info.ts
 * (requires DEMO_ACCOUNT_EMAIL, REVIEW_CONTACT_EMAIL, REVIEW_CONTACT_PHONE,
 * REVIEW_DEMO_CODE_URL
 * in the environment, in addition to the App Store Connect API key trio)
 */
import { createSign } from "node:crypto";

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

const missing = [
  !KEY_ID && "APP_STORE_CONNECT_KEY_ID",
  !ISSUER_ID && "APP_STORE_CONNECT_ISSUER_ID",
  !KEY_P8_BASE64 && "APP_STORE_CONNECT_KEY_P8_BASE64",
  !DEMO_ACCOUNT_EMAIL && "DEMO_ACCOUNT_EMAIL",
  !REVIEW_CONTACT_EMAIL && "REVIEW_CONTACT_EMAIL",
  !REVIEW_CONTACT_PHONE && "REVIEW_CONTACT_PHONE",
  !REVIEW_DEMO_CODE_URL && "REVIEW_DEMO_CODE_URL",
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

const buildReviewNotes = (
  demoAccountEmail: string,
  reviewContactEmail: string,
  demoCodeURL: string,
) => `Learn with Alphonso is an English, French and Spanish learning app with
structured lessons, spaced repetition, AI speaking practice, an audio
library and optional social features.

DEMO ACCOUNT
  Email:  ${demoAccountEmail}
  This app has no passwords; it signs in with a 6-digit code. To sign in:
    1. Enter the email above and tap "Send code".
    2. Open this page for the current code (no login needed):
       ${demoCodeURL}
    3. Enter that code and tap "Verify".
  Opening the page issues a new code, so please do step 1 before step 2.
  If anything goes wrong, contact ${reviewContactEmail}.

The account already has lesson progress, a streak and items in the
review queue, so every feature below can be exercised immediately. It
also already holds a promotional Pro entitlement, so Hector is unlocked
without needing to purchase anything.

HOW TO REACH EACH FEATURE

  Lessons and SRS
    Learn tab -> any unit -> any lesson. The badge on the Learn tab is the
    count of reviews currently due; tap it for the review queue.

  AI speaking practice  (MICROPHONE REQUIRED, HOLD the mic button to talk)
    Practice tab -> choose a scenario -> hold the microphone button and
    speak, then release to send. Before the first AI interaction a sheet
    asks permission to send audio and text to the named providers
    (Deepgram, NVIDIA): "Allow" turns it on, "Not now" leaves it off.

  Hector, the AI tutor  (PAID, already unlocked on this account)
    Hector tab. Same hold-to-talk microphone control as Practice.

  Audio library
    Listen tab -> English -> A1 -> "Ordering Coffee". Playback continues
    with the screen locked and appears on the lock screen and in Control
    Center. Episodes can also be downloaded for offline playback.

  Social
    Profile -> Friends, League. Teams are reachable from the League
    screen; a team shows its own join code so another member can share it
    for a friend to enter under "Join a team." Duels can be started
    against friends or via open matchmaking. Every place another learner
    appears (leaderboards, friends, duels, team members) has a "..." menu
    with Block and Report, and public team names have "Report Team Name".

  Account deletion
    Profile -> Settings -> Account -> Delete My Account. Deletion is
    initiated and completed in the app; typing DELETE confirms it.
    Export My Data is in the same section.

SUBSCRIPTION (to see and test the purchase)

  One auto-renewable subscription, "Alphonso Pro Monthly," unlocks
  Hector and is submitted together with this version. The demo account
  already has Pro, so it does not show the paywall. To test the
  purchase: Profile -> Settings -> Sign out, then "Continue with Apple"
  to create a fresh account, and open the Hector tab.

  The paywall shows the free trial (for eligible accounts), then the
  price and billing period read from StoreKit in your storefront's
  currency, plus Restore Purchases, Manage Subscription, and links to
  the Terms of Use and Privacy Policy.

THIRD-PARTY PROCESSING

  Voice audio is sent to Deepgram for speech-to-text and text-to-speech.
  Text from the Practice tab's conversation, from graded written answers,
  and from Hector's conversation is sent to NVIDIA for AI responses;
  Hector's spoken replies are synthesized by Deepgram. All of this is
  disclosed in-app before the first AI interaction and in the privacy
  policy.

BACKGROUND AUDIO

  The audio background mode is used only for podcast playback in the
  Listen tab, so an episode keeps playing when the device is locked.

WHAT THE APP DOES NOT DO

  No advertising, no analytics or crash-reporting SDKs, no tracking, and
  no data shared with data brokers. Location, contacts and photos are
  never accessed.`;

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
  await verifyReviewerSignIn(DEMO_ACCOUNT_EMAIL!, REVIEW_DEMO_CODE_URL!);

  console.log(`\nFinding the app's editable App Store version...`);
  const versions = await api(
    `/apps/${APP_ID}/appStoreVersions?filter[appVersionState]=PREPARE_FOR_SUBMISSION`,
  );
  const version = (versions.data as AscResource[])[0];
  if (!version) {
    throw new Error(
      "No appStoreVersion in PREPARE_FOR_SUBMISSION found -- nothing editable right now.",
    );
  }
  console.log(`Version: ${version.attributes?.versionString} (${version.id})`);

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
    demoAccountPassword:
      "No password (sign-in is a 6-digit code). Tap Send code, then open the sign-in code page linked in the notes.",
    demoAccountRequired: true,
    notes: buildReviewNotes(DEMO_ACCOUNT_EMAIL!, REVIEW_CONTACT_EMAIL!, REVIEW_DEMO_CODE_URL!),
  };

  // App Store Connect caps review notes at 4000 characters.
  if (reviewAttributes.notes.length > 4000) {
    throw new Error(`Review notes are ${reviewAttributes.notes.length} chars; the limit is 4000.`);
  }
  console.log(`Review notes length: ${reviewAttributes.notes.length}/4000`);

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
