/**
 * Writes the App Store Connect Version 1.0 localization fields (description,
 * keywords, promotional text, support/marketing URL) and the app subtitle from
 * the reviewed copy in src/lib/app-store/listing-copy.ts.
 *
 * Modes: "check" (the default) prints current versus new values and writes
 * nothing; "apply" saves them.
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
 * Works on any editable version state (see editable-version.ts), including
 * a version the developer removed from review.
 *
 * Usage: bunx tsx scripts/update-app-store-metadata.ts [check|apply]
 */
import { createSign } from "node:crypto";
import {
  editableVersionQuery,
  pickEditableAppInfo,
  pickEditableVersion,
} from "../src/lib/app-store/editable-version";
import { LISTING, listingProblems } from "../src/lib/app-store/listing-copy";

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

async function main() {
  const problems = listingProblems(LISTING);
  if (problems.length > 0) {
    console.error(`Listing copy has problems:\n${problems.join("\n")}`);
    process.exit(1);
  }
  const MODE = process.argv[2] === "apply" ? "apply" : "check";
  const { subtitle, ...versionFields } = LISTING;

  console.log(`Mode: ${MODE}. Finding the app's editable App Store version...`);
  const versions = await api(`/apps/${APP_ID}/appStoreVersions?${editableVersionQuery()}`);
  const version = pickEditableVersion(versions.data as AscResource[]);
  console.log(
    `Version: ${version.attributes?.versionString} (${version.attributes?.appVersionState}, ${version.id})`,
  );

  console.log(`Finding its en-US localization...`);
  const locs = await api(`/appStoreVersions/${version.id}/appStoreVersionLocalizations`);
  const loc = (locs.data as AscResource[]).find((l) => l.attributes?.locale === "en-US");
  if (!loc) throw new Error("No en-US appStoreVersionLocalization found.");
  console.log(`Localization: ${loc.id}`);

  const infos = await api(`/apps/${APP_ID}/appInfos`);
  const info = pickEditableAppInfo(infos.data as AscResource[]);
  const infoLocs = await api(`/appInfos/${info.id}/appInfoLocalizations`);
  const infoLoc = (infoLocs.data as AscResource[]).find((l) => l.attributes?.locale === "en-US");
  if (!infoLoc) throw new Error("No en-US appInfoLocalization found.");

  const changed: string[] = [];
  for (const [key, value] of Object.entries(versionFields)) {
    const current = String(loc.attributes?.[key] ?? "");
    const same = current === value;
    if (!same) changed.push(key);
    console.log(`\n--- ${key}: ${same ? "unchanged" : "CHANGES"} ---`);
    if (!same) console.log(`current: ${current || "(empty)"}\nnew:     ${value}`);
  }
  const currentSubtitle = String(infoLoc.attributes?.subtitle ?? "");
  console.log(`\n--- subtitle: ${currentSubtitle === subtitle ? "unchanged" : "CHANGES"} ---`);
  if (currentSubtitle !== subtitle) {
    changed.push("subtitle");
    console.log(`current: ${currentSubtitle || "(empty)"}\nnew:     ${subtitle}`);
  }

  if (MODE !== "apply") {
    console.log(
      `\nCheck only. Fields that would change: ${changed.join(", ") || "none"}. Run with "apply" to save.`,
    );
    return;
  }

  console.log(`\nWriting (SAVE ONLY -- this is a draft PATCH, not a submission)...`);
  const updated = await api(`/appStoreVersionLocalizations/${loc.id}`, "PATCH", {
    data: { type: "appStoreVersionLocalizations", id: loc.id, attributes: versionFields },
  });
  const updatedAttrs = { ...((updated.data as AscResource).attributes ?? {}) };
  const updatedInfo = await api(`/appInfoLocalizations/${infoLoc.id}`, "PATCH", {
    data: { type: "appInfoLocalizations", id: infoLoc.id, attributes: { subtitle } },
  });
  updatedAttrs.subtitle = (updatedInfo.data as AscResource).attributes?.subtitle;

  console.log(`\nRead back after write, to confirm each field actually stuck:`);
  let allMatch = true;
  for (const [key, expected] of Object.entries({ ...versionFields, subtitle })) {
    const matches = String(updatedAttrs[key] ?? "") === expected;
    allMatch = allMatch && matches;
    console.log(`  ${key}: ${matches ? "OK" : "MISMATCH"}`);
  }
  console.log(
    allMatch
      ? "\nAll fields confirmed saved. Nothing was submitted -- this is still a draft."
      : "\nSome fields did not match after write -- check the mismatches above.",
  );
  if (!allMatch) process.exitCode = 1;
  console.log(
    "\nNOT written: Copyright (see update-app-review-info.ts) and What's New (Apple's API rejects " +
      "editing it with a 409 STATE_ERROR for a first release).",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
