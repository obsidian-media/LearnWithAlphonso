/**
 * Writes the App Store Connect Version 1.0 localization fields (description,
 * keywords, promotional text, support/marketing URL, what's new) from the
 * approved copy in D:\AgentDevWork\repos\Hackaton\Shipaton\
 * App-Store-Metadata-ChatGPT-Polished.md.
 *
 * SAVE ONLY -- this writes a draft App Store Connect version's fields via
 * PATCH, the same as typing into the web UI and it staying unsubmitted. It
 * does NOT create a new version, does NOT touch state/appStoreState, and
 * does NOT call the separate "submit for review" endpoint. Nothing here can
 * accidentally submit anything.
 *
 * Diffs against the live value before writing each field and prints both,
 * so nothing already set gets overwritten unseen.
 *
 * Copyright is deliberately NOT written -- the copy draft itself flags the
 * legal entity name as unconfirmed, and this script only ever writes values
 * that have been positively confirmed, never a best guess.
 *
 * Uses the same App Store Connect API key already configured for
 * ios-release.yml -- no new credentials.
 *
 * Usage: bunx tsx scripts/update-app-store-metadata.ts
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

async function api(path: string, method: "GET" | "PATCH" = "GET", body?: unknown) {
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

// The approved copy -- kept inline rather than parsed from the markdown so
// this script has no dependency on that file's exact formatting.
const NEW_VALUES = {
  promotionalText:
    "Build a language habit with short lessons, speaking practice, podcasts, and Hector\u2014your optional AI voice tutor.",
  keywords:
    "english,french,spanish,speaking,vocabulary,grammar,fluency,practice,tutor,podcast,listening,cefr",
  supportUrl: "https://learn.alphonsoecosystem.app/support",
  marketingUrl: "https://learn.alphonsoecosystem.app",
  // whatsNew deliberately omitted: Apple's API rejects it with a 409
  // STATE_ERROR ("Attribute 'whatsNew' cannot be edited at this time")
  // for this version -- confirmed live, not a guess. Expected for a
  // first release (nothing prior to describe changes from); revisit if
  // the App Store Connect UI itself later shows the field as editable.
  description: `Learn With Alphonso makes language practice feel possible on a real day.

Build confidence in English, French, and Spanish with focused lessons, speaking practice, listening, and a review routine that helps you return to the words and skills that need another pass.

START WHERE YOU ARE
Take a placement test, choose your course, and learn through CEFR-graded lessons from beginner to advanced levels.

PRACTICE MORE THAN ONE SKILL
Work through vocabulary, grammar, translation, listening, and speaking activities. Use short sessions when you have a few minutes, then pick up where you left off.

SPEAK WITH CONFIDENCE
Practice useful everyday scenarios out loud. Get a transcript and feedback while you build the confidence to use your target language beyond the lesson.

LISTEN ON YOUR SCHEDULE
Explore level-appropriate audio with transcripts. Keep listening with the screen locked, or download available episodes for offline listening.

MAKE PROGRESS VISIBLE
Keep up a daily streak, revisit due reviews, and use progress tools that make the next useful practice step clear. Optional teams, friends, leagues, and challenges make it easier to stay motivated together.

MEET HECTOR, YOUR AI VOICE TUTOR
Alphonso Pro unlocks Hector, an AI voice tutor for guided conversation practice and language help tailored to your learning journey.

PRIVACY
Learn With Alphonso does not use advertising or tracking. You can manage your account, export your data, or delete your account in the app.

Learn With Alphonso is free to download. Alphonso Pro is an optional auto-renewable subscription that unlocks Hector, the AI voice tutor.`,
};

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

  console.log(`Finding its en-US localization...`);
  const locs = await api(`/appStoreVersions/${version.id}/appStoreVersionLocalizations`);
  const loc = (locs.data as AscResource[]).find((l) => l.attributes?.locale === "en-US");
  if (!loc) throw new Error("No en-US appStoreVersionLocalization found.");
  console.log(`Localization: ${loc.id}`);

  console.log(`\nCurrent live values:`);
  for (const key of Object.keys(NEW_VALUES) as (keyof typeof NEW_VALUES)[]) {
    const current = String(loc.attributes?.[key] ?? "(empty)");
    console.log(`\n--- ${key} (current) ---\n${current}`);
  }

  console.log(`\nNew values to write:`);
  for (const [key, value] of Object.entries(NEW_VALUES)) {
    console.log(`\n--- ${key} (new) ---\n${value}`);
  }

  console.log(`\nWriting (SAVE ONLY -- this is a draft PATCH, not a submission)...`);
  const updated = await api(`/appStoreVersionLocalizations/${loc.id}`, "PATCH", {
    data: { type: "appStoreVersionLocalizations", id: loc.id, attributes: NEW_VALUES },
  });
  const updatedAttrs = (updated.data as AscResource).attributes ?? {};

  console.log(`\nRead back after write, to confirm each field actually stuck:`);
  let allMatch = true;
  for (const [key, expected] of Object.entries(NEW_VALUES)) {
    const actual = String(updatedAttrs[key] ?? "");
    const matches = actual === expected;
    allMatch = allMatch && matches;
    console.log(`  ${key}: ${matches ? "OK" : "MISMATCH"}`);
    if (!matches) {
      console.log(`    expected: ${expected}`);
      console.log(`    actual:   ${actual}`);
    }
  }

  console.log(
    allMatch
      ? "\nAll fields confirmed saved. Nothing was submitted -- this is still a draft."
      : "\nSome fields did not match after write -- check the mismatches above.",
  );
  console.log(
    "\nNOT written: Copyright and Subtitle need manual confirmation first (Subtitle is also a " +
      "separate appInfoLocalizations resource, not this one). What's New was left as-is -- " +
      "Apple's API rejects editing it for this version (409 STATE_ERROR), expected for a first release.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
