/**
 * Shipaton Day 1: checks whether the Paid Applications Agreement is
 * signed (App Store Connect -> Agreements, Tax, and Banking), and can
 * create the real "Alphonso Pro" subscription group once it is.
 *
 * A prior session tried to check the agreement indirectly and the
 * result was inconclusive (docs/v2-kickoffs/09-revenuecat-and-app-store-
 * launch.md). There is no direct "agreement status" read endpoint in
 * the public App Store Connect API, so this script uses the same
 * indirect method -- attempt a real write (creating the subscription
 * group) -- but prints Apple's full JSON error body on failure instead
 * of just a status code, which is what made the earlier attempt
 * inconclusive.
 *
 * Uses the same App Store Connect API key already configured for
 * ios-release.yml -- no new credentials.
 *
 * Usage:
 *   node_modules/.bin/tsx scripts/check-subscription-status.ts check
 *   node_modules/.bin/tsx scripts/check-subscription-status.ts create-group
 *
 * Requires APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID,
 * APP_STORE_CONNECT_KEY_P8_BASE64 in the environment, and APP_ID
 * (defaults to Learn With Alphonso's known app id, 6813969159).
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

async function api(
  path: string,
  method: "GET" | "POST" = "GET",
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

async function main() {
  const cmd = process.argv[2];

  console.log(`App id: ${APP_ID}`);
  const app = await api(`/apps/${APP_ID}`);
  if (!app.ok) {
    console.error("Could not fetch app record -- check APP_ID/credentials.");
    console.error(JSON.stringify(app.json, null, 2));
    process.exit(1);
  }
  const appData = app.json as { data: { attributes: { name: string; bundleId: string } } };
  console.log(
    `Confirmed app: ${appData.data.attributes.name} (${appData.data.attributes.bundleId})`,
  );

  console.log("\nExisting subscription groups:");
  const groups = await api(`/apps/${APP_ID}/subscriptionGroups`);
  if (groups.ok) {
    const g = groups.json as { data: { id: string; attributes: { referenceName: string } }[] };
    if (g.data.length === 0) {
      console.log("  (none yet)");
    } else {
      for (const grp of g.data) {
        console.log(`  ${grp.id}  "${grp.attributes.referenceName}"`);
      }
    }
  } else {
    console.log(`  Could not list (status ${groups.status}):`);
    console.log(JSON.stringify(groups.json, null, 2));
  }

  if (cmd === "subscription-state") {
    // ChatGPT-sourced audit (2026-09-28), item 4: the subscription's OWN
    // review state (not the app version's, and not the subscription
    // GROUP's) is a separate, unread field this session -- read-only.
    const subscriptionId = process.env.SUBSCRIPTION_ID ?? "6815009725";
    const sub = await api(`/subscriptions/${subscriptionId}`);
    console.log(`\nSubscription ${subscriptionId} status: ${sub.status}`);
    console.log(JSON.stringify(sub.json, null, 2));
  } else if (cmd === "review-screenshot") {
    // Follow-up to subscription-state coming back MISSING_METADATA: an
    // earlier session's execution-record claimed this was uploaded via
    // upload-review-screenshot.ts on 2026-09-23 -- reading the real
    // relationship directly rather than trusting that record.
    const subscriptionId = process.env.SUBSCRIPTION_ID ?? "6815009725";
    const shot = await api(`/subscriptions/${subscriptionId}/appStoreReviewScreenshot`);
    console.log(`\nReview screenshot status: ${shot.status}`);
    console.log(JSON.stringify(shot.json, null, 2));
  } else if (cmd === "capabilities") {
    // Submission-readiness audit (2026-09-28): the entitlements files'
    // own comments say Sign in with Apple's Developer Portal capability
    // enablement was "not yet confirmed done" -- this checks the real
    // bundleIdCapabilities for the app's real bundle id, read-only.
    const bundleId = appData.data.attributes.bundleId;
    const bundles = await api(
      `/bundleIds?filter[identifier]=${encodeURIComponent(bundleId)}&include=bundleIdCapabilities`,
    );
    console.log(`\nStatus: ${bundles.status}`);
    console.log(JSON.stringify(bundles.json, null, 2));
  } else if (cmd === "builds") {
    // Live report (2026-09-28): a user re-tested Hector right after build
    // 37's "UPLOAD SUCCEEDED" and saw the exact pre-fix symptom again --
    // most likely explanation is TestFlight was still processing build 37
    // (virus scan/compliance can take anywhere from minutes to an hour),
    // so the device was still running build 36. Checking the real
    // processingState instead of guessing.
    const builds = await api(
      `/builds?filter[app]=${APP_ID}&sort=-uploadedDate&limit=5&fields[builds]=version,processingState,uploadedDate,expired`,
    );
    console.log(`\nStatus: ${builds.status}`);
    console.log(JSON.stringify(builds.json, null, 2));
  } else if (cmd === "app-info") {
    // Shipaton Part 2 prep: re-verify category + age rating are still
    // correct via the API rather than trusting prior session notes.
    const appInfos = await api(
      `/apps/${APP_ID}/appInfos?include=ageRatingDeclaration,primaryCategory`,
    );
    console.log(`\nStatus: ${appInfos.status}`);
    console.log(JSON.stringify(appInfos.json, null, 2));
  } else if (cmd === "readiness") {
    // Submission-readiness sweep: everything a "Submit for Review" click
    // would actually need (or, once submitted, what Apple is actually
    // reviewing), checked live rather than trusted from prior session
    // notes -- the version's own state, whether a processed build is
    // attached to it, the en-US listing localization, the appInfo
    // localization (name/subtitle/privacy policy URL), and the App
    // Review Information block. Read-only throughout.
    //
    // No appVersionState filter: once a version is submitted it moves out
    // of PREPARE_FOR_SUBMISSION (e.g. to WAITING_FOR_REVIEW/IN_REVIEW), so
    // filtering on that state would silently find nothing post-submission.
    // Fetch all versions and prefer whichever one isn't in a terminal
    // READY_FOR_SALE/REJECTED state from a prior release.
    console.log("\n--- appStoreVersions (all) ---");
    const versions = await api(`/apps/${APP_ID}/appStoreVersions?include=build&limit=50`);
    console.log(`Status: ${versions.status}`);
    console.log(JSON.stringify(versions.json, null, 2));
    const versionsJson = versions.json as {
      data?: {
        id: string;
        attributes?: { versionString?: string; appVersionState?: string };
        relationships?: { build?: { data?: { id: string } | null } };
      }[];
      included?: {
        type: string;
        id: string;
        attributes?: { version?: string; processingState?: string };
      }[];
    };
    const relevantStates = new Set([
      "PREPARE_FOR_SUBMISSION",
      "WAITING_FOR_REVIEW",
      "IN_REVIEW",
      "PENDING_DEVELOPER_RELEASE",
      "PENDING_APPLE_RELEASE",
      "PROCESSING_FOR_APP_STORE",
      "METADATA_REJECTED",
      "REJECTED",
      "DEVELOPER_REJECTED",
      "INVALID_BINARY",
    ]);
    const version =
      versionsJson.data?.find((v) => relevantStates.has(v.attributes?.appVersionState ?? "")) ??
      versionsJson.data?.[0];
    if (!version) {
      console.log("\nNo appStoreVersions found at all -- nothing else to check.");
      return;
    }
    console.log(
      `\nSelected version: ${version.attributes?.versionString} (${version.id}), state: ${version.attributes?.appVersionState}`,
    );
    const attachedBuildId = version.relationships?.build?.data?.id;
    const attachedBuild = attachedBuildId
      ? versionsJson.included?.find((r) => r.type === "builds" && r.id === attachedBuildId)
      : undefined;
    console.log(
      attachedBuild
        ? `Attached build: ${attachedBuild.attributes?.version} (processingState: ${attachedBuild.attributes?.processingState})`
        : "Attached build: NONE -- a build must be selected before this can be submitted.",
    );

    console.log("\n--- appStoreVersionLocalizations (en-US) ---");
    const locs = await api(`/appStoreVersions/${version.id}/appStoreVersionLocalizations`);
    const locsJson = locs.json as {
      data?: { attributes?: Record<string, unknown> }[];
    };
    const loc = locsJson.data?.find((l) => l.attributes?.locale === "en-US");
    if (!loc) {
      console.log("No en-US appStoreVersionLocalization found.");
    } else {
      for (const field of [
        "description",
        "keywords",
        "promotionalText",
        "supportUrl",
        "marketingUrl",
        "whatsNew",
      ]) {
        const val = loc.attributes?.[field];
        console.log(`  ${field}: ${val ? "SET" : "(empty)"}`);
      }
    }

    console.log("\n--- appInfos + appInfoLocalizations (en-US) ---");
    const appInfos = await api(`/apps/${APP_ID}/appInfos`);
    const appInfosJson = appInfos.json as { data?: { id: string }[] };
    const appInfo = appInfosJson.data?.[0];
    if (appInfo) {
      const appInfoLocs = await api(`/appInfos/${appInfo.id}/appInfoLocalizations`);
      const appInfoLocsJson = appInfoLocs.json as {
        data?: { attributes?: Record<string, unknown> }[];
      };
      const infoLoc = appInfoLocsJson.data?.find((l) => l.attributes?.locale === "en-US");
      if (!infoLoc) {
        console.log("No en-US appInfoLocalization found.");
      } else {
        for (const field of ["name", "subtitle", "privacyPolicyUrl", "privacyChoicesUrl"]) {
          const val = infoLoc.attributes?.[field];
          console.log(`  ${field}: ${val ? "SET" : "(empty)"}`);
        }
      }
    } else {
      console.log("No appInfo found.");
    }

    console.log("\n--- appStoreReviewDetail ---");
    const reviewDetail = await api(`/appStoreVersions/${version.id}/appStoreReviewDetail`);
    const reviewDetailJson = reviewDetail.json as {
      data?: { attributes?: Record<string, unknown> };
    };
    if (!reviewDetailJson.data) {
      console.log("No appStoreReviewDetail found.");
    } else {
      const attrs = reviewDetailJson.data.attributes ?? {};
      for (const field of [
        "contactFirstName",
        "contactLastName",
        "contactEmail",
        "contactPhone",
        "demoAccountName",
        "demoAccountPassword",
        "demoAccountRequired",
        "notes",
      ]) {
        const val = attrs[field];
        console.log(
          `  ${field}: ${val !== null && val !== undefined && val !== "" ? "SET" : "(empty)"}`,
        );
      }
    }
  } else if (cmd === "attach-latest-build") {
    // Pre-submission: "readiness" found the PREPARE_FOR_SUBMISSION
    // version has no build attached at all (relationships.build.data was
    // null) -- required before "Submit for Review" is even clickable.
    // SAVE ONLY: a PATCH on the version's own build relationship, the
    // same as picking a build from the dropdown in the web UI and not
    // pressing submit. Picks the highest-numbered VALID, non-expired
    // build rather than assuming the most recently uploaded one is
    // still valid.
    console.log("\nFinding the PREPARE_FOR_SUBMISSION version...");
    const versions = await api(
      `/apps/${APP_ID}/appStoreVersions?filter[appVersionState]=PREPARE_FOR_SUBMISSION`,
    );
    const versionsJson = versions.json as {
      data?: { id: string; attributes?: { versionString?: string } }[];
    };
    const version = versionsJson.data?.[0];
    if (!version) {
      console.error("No PREPARE_FOR_SUBMISSION version found.");
      process.exit(1);
    }
    console.log(`Version: ${version.attributes?.versionString} (${version.id})`);

    console.log("\nFinding the latest VALID, non-expired build...");
    const builds = await api(
      `/builds?filter[app]=${APP_ID}&sort=-uploadedDate&limit=10&fields[builds]=version,processingState,uploadedDate,expired`,
    );
    const buildsJson = builds.json as {
      data?: {
        id: string;
        attributes?: { version?: string; processingState?: string; expired?: boolean };
      }[];
    };
    const candidate = buildsJson.data?.find(
      (b) => b.attributes?.processingState === "VALID" && b.attributes?.expired === false,
    );
    if (!candidate) {
      console.error("No VALID, non-expired build found among the 10 most recent uploads.");
      console.error(JSON.stringify(buildsJson, null, 2));
      process.exit(1);
    }
    console.log(`Build: ${candidate.attributes?.version} (${candidate.id})`);

    console.log("\nAttaching (SAVE ONLY -- this is a draft PATCH, not a submission)...");
    const patched = await api(`/appStoreVersions/${version.id}`, "PATCH", {
      data: {
        type: "appStoreVersions",
        id: version.id,
        relationships: { build: { data: { type: "builds", id: candidate.id } } },
      },
    });
    console.log(`Status: ${patched.status}`);

    console.log("\nReading back to confirm...");
    const confirm = await api(`/appStoreVersions/${version.id}?include=build`);
    const confirmJson = confirm.json as {
      included?: { attributes?: { version?: string } }[];
    };
    const attached = confirmJson.included?.[0]?.attributes?.version;
    console.log(
      attached === candidate.attributes?.version
        ? `Confirmed: build ${attached} is now attached. Nothing was submitted -- this is still a draft.`
        : `MISMATCH -- expected build ${candidate.attributes?.version}, relationship now shows ${attached ?? "(none)"}.`,
    );
  } else if (cmd === "create-group") {
    console.log('\nAttempting to create subscription group "Alphonso Pro"...');
    const result = await api("/subscriptionGroups", "POST", {
      data: {
        type: "subscriptionGroups",
        attributes: { referenceName: "Alphonso Pro" },
        relationships: { app: { data: { type: "apps", id: APP_ID } } },
      },
    });
    console.log(`Status: ${result.status}`);
    console.log(JSON.stringify(result.json, null, 2));
    if (result.ok) {
      console.log(
        "\n✅ SUCCESS -- Paid Applications Agreement is signed, and the real subscription group now exists.",
      );
    } else {
      console.log(
        "\n❌ FAILED -- read the error body above. If it mentions an unsigned/missing agreement, " +
          "the Paid Applications Agreement needs to be signed in App Store Connect (Agreements, Tax, " +
          "and Banking) before this can succeed -- that step needs the account owner directly.",
      );
    }
  } else {
    console.log('\n(Run with "create-group" instead of "check" to attempt actually creating it.)');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
