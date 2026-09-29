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
 * (requires DEMO_ACCOUNT_EMAIL, REVIEW_CONTACT_EMAIL, REVIEW_CONTACT_PHONE
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

const missing = [
  !KEY_ID && "APP_STORE_CONNECT_KEY_ID",
  !ISSUER_ID && "APP_STORE_CONNECT_ISSUER_ID",
  !KEY_P8_BASE64 && "APP_STORE_CONNECT_KEY_P8_BASE64",
  !DEMO_ACCOUNT_EMAIL && "DEMO_ACCOUNT_EMAIL",
  !REVIEW_CONTACT_EMAIL && "REVIEW_CONTACT_EMAIL",
  !REVIEW_CONTACT_PHONE && "REVIEW_CONTACT_PHONE",
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
) => `Learn with Alphonso is an English, French and Spanish learning app with
structured lessons, spaced repetition, AI speaking practice, an audio
library and optional social features.

DEMO ACCOUNT
  Email:    ${demoAccountEmail}
  Sign-in:  email code (this app has no passwords). The code is emailed
            to that address -- if it does not arrive within a couple of
            minutes, contact ${reviewContactEmail} and it will be
            relayed within minutes.

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
    speak, then release to send. A disclosure sheet appears before the
    first AI interaction explaining that audio is sent to our
    speech-processing and AI providers; it must be accepted once.

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
    against friends or via open matchmaking. Every user-facing surface has
    a "..." menu offering Block and Report.

  Account deletion
    Profile -> Settings -> Account -> Delete My Account. Deletion is
    initiated and completed in the app; typing DELETE confirms it.
    Export My Data is in the same section.

SUBSCRIPTION

  One auto-renewable subscription, "Alphonso Pro Monthly," unlocks
  Hector. Price and billing period are rendered from StoreKit rather than
  hard-coded, so they display in the reviewer's own storefront currency.
  Restore Purchases is on the same screen.

  Please note: this is our FIRST auto-renewable subscription, so per
  Apple's own documentation it cannot load until it is reviewed alongside
  this build. If the paywall shows "can't load options" before the
  subscription is approved, that is the expected pre-approval state and
  not a defect. Once approved it resolves without an app update. The demo
  account's promotional entitlement lets Hector be reached regardless.

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

async function main() {
  console.log(`Finding the app's editable App Store version...`);
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
      "No password -- this app is passwordless (email sign-in code). See notes for how the code is relayed.",
    demoAccountRequired: true,
    notes: buildReviewNotes(DEMO_ACCOUNT_EMAIL!, REVIEW_CONTACT_EMAIL!),
  };

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
