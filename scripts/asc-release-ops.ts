/**
 * Release operations no other script covers. Read-only unless the last arg is "--apply".
 *
 *   asc-release-ops.ts builds                         # list builds (version, state, expired)
 *   asc-release-ops.ts expire-builds 49 [--apply]     # irreversible with --apply; needs a newer VALID build
 *   asc-release-ops.ts attach-build 50 [--apply]      # attach that exact build to the editable 1.0
 *   asc-release-ops.ts beta-review-info [--apply]     # TestFlight Beta App Review demo info
 *   asc-release-ops.ts content-rights [--apply]       # apps.contentRightsDeclaration = USES_THIRD_PARTY_CONTENT
 *   asc-release-ops.ts release-type [MANUAL|AFTER_APPROVAL] [--apply]
 *   asc-release-ops.ts submission-check               # read-only pre-submit sweep, exits 1 on any FAIL
 *
 * Env: APP_STORE_CONNECT_KEY_ID/ISSUER_ID/KEY_P8_BASE64; for beta-review-info also
 * DEMO_ACCOUNT_EMAIL, REVIEW_CONTACT_EMAIL, REVIEW_CONTACT_PHONE, REVIEW_DEMO_CODE_URL.
 * Prints no secret: the demo email, the contact details and the code URL are never logged.
 * Nothing here submits anything for review.
 */
import { createSign } from "node:crypto";
import { ageRatingProblems } from "../src/lib/app-store/age-rating";
import {
  buildsToExpire,
  findBuild,
  requireNewerValidBuild,
  type AscBuild,
} from "../src/lib/app-store/build-selection";
import { editableVersionQuery, pickEditableVersion } from "../src/lib/app-store/editable-version";
import { LISTING } from "../src/lib/app-store/listing-copy";
import { buildBetaReviewNotes } from "../src/lib/app-store/review-notes";

const KEY_ID = process.env.APP_STORE_CONNECT_KEY_ID;
const ISSUER_ID = process.env.APP_STORE_CONNECT_ISSUER_ID;
const KEY_P8_BASE64 = process.env.APP_STORE_CONNECT_KEY_P8_BASE64;
const APP_ID = process.env.APP_ID ?? "6813969159";
const SUBSCRIPTION_ID = process.env.SUBSCRIPTION_ID ?? "6815009725";
const DECLARATION_ID =
  process.env.AGE_RATING_DECLARATION_ID ?? "74c50170-c089-4201-8fb6-2e6155eae246";
const [cmd, arg] = process.argv.slice(2).filter((a) => a !== "--apply");
const APPLY = process.argv.includes("--apply");

const missing = [
  !KEY_ID && "APP_STORE_CONNECT_KEY_ID",
  !ISSUER_ID && "APP_STORE_CONNECT_ISSUER_ID",
  !KEY_P8_BASE64 && "APP_STORE_CONNECT_KEY_P8_BASE64",
].filter(Boolean);
if (missing.length > 0) {
  console.error(`Missing environment variable(s): ${missing.join(", ")}`);
  process.exit(1);
}

/** Reads a required env var without ever printing its value. */
function need(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
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

type Api = { ok: boolean; status: number; json: unknown };

async function api(
  path: string,
  method: "GET" | "PATCH" | "POST" | "DELETE" = "GET",
  body?: unknown,
): Promise<Api> {
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${makeJWT()}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  // DELETE answers 204 with no body.
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { ok: res.ok, status: res.status, json };
}

type Resource = { id: string; attributes?: Record<string, unknown> };
const dataOf = <T>(r: Api): T => (r.json as { data: T }).data;

async function listBuilds(): Promise<AscBuild[]> {
  const r = await api(
    `/builds?filter[app]=${APP_ID}&sort=-uploadedDate&limit=200&fields[builds]=version,processingState,expired,uploadedDate`,
  );
  if (!r.ok) throw new Error(`list builds failed: ${r.status}`);
  return dataOf<AscBuild[]>(r);
}

async function editableVersion(): Promise<Resource> {
  const v = await api(`/apps/${APP_ID}/appStoreVersions?${editableVersionQuery()}`);
  if (!v.ok) throw new Error(`list versions failed: ${v.status}`);
  return pickEditableVersion(
    dataOf<{ id: string; attributes?: { versionString?: string; appVersionState?: string } }[]>(v),
  );
}

type Check = { name: string; pass: boolean; detail?: string };

/** Read-only sweep of everything that must be true before the version is submitted. Prints no secret. */
async function submissionCheck(): Promise<void> {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, detail });
  const attempt = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      add(name, false, err instanceof Error ? err.message : String(err));
    }
  };

  let versionId = "";
  await attempt("editable version", async () => {
    const version = await editableVersion();
    versionId = version.id;
    add(
      "editable version",
      true,
      `${String(version.attributes?.versionString)} ${String(version.attributes?.appVersionState)}`,
    );
  });

  if (versionId) {
    await attempt("attached build", async () => {
      const r = await api(`/appStoreVersions/${versionId}/build`);
      const version = (dataOf<Resource | null>(r)?.attributes?.version as string | undefined) ?? "";
      add("a build is attached", Boolean(version), version ? `build ${version}` : "none attached");
    });

    await attempt("listing text", async () => {
      const locs = dataOf<Resource[]>(
        await api(`/appStoreVersions/${versionId}/appStoreVersionLocalizations`),
      );
      const loc = locs.find((l) => l.attributes?.locale === "en-US");
      add(
        "description matches the reviewed copy",
        loc?.attributes?.description === LISTING.description,
      );
      add("keywords match the reviewed copy", loc?.attributes?.keywords === LISTING.keywords);
      add("marketing URL matches", loc?.attributes?.marketingUrl === LISTING.marketingUrl);

      const infos = dataOf<Resource[]>(await api(`/apps/${APP_ID}/appInfos`));
      let subtitleMatches = false;
      for (const info of infos) {
        const infoLocs = dataOf<Resource[]>(await api(`/appInfos/${info.id}/appInfoLocalizations`));
        if (
          infoLocs.some(
            (l) => l.attributes?.locale === "en-US" && l.attributes?.subtitle === LISTING.subtitle,
          )
        ) {
          subtitleMatches = true;
        }
      }
      add("subtitle matches the reviewed copy", subtitleMatches);

      if (loc) {
        const sets = dataOf<Resource[]>(
          await api(`/appStoreVersionLocalizations/${loc.id}/appScreenshotSets`),
        );
        const set = sets.find((s) => s.attributes?.screenshotDisplayType === "APP_IPHONE_67");
        const shots = set
          ? dataOf<Resource[]>(await api(`/appScreenshotSets/${set.id}/appScreenshots`))
          : [];
        const states = shots.map(
          (s) => (s.attributes?.assetDeliveryState as { state?: string } | undefined)?.state,
        );
        add(
          "6.7-inch screenshot set has 3 to 10 complete shots",
          shots.length >= 3 && shots.length <= 10 && states.every((s) => s === "COMPLETE"),
          `${shots.length} shot(s)`,
        );
      }
    });

    await attempt("review detail", async () => {
      const r = await api(`/appStoreVersions/${versionId}/appStoreReviewDetail`);
      const detail = dataOf<Resource | null>(r);
      const notes = String(detail?.attributes?.notes ?? "");
      add(
        "review notes are between 1 and 4000 characters",
        notes.length >= 1 && notes.length <= 4000,
        `${notes.length} characters`,
      );
      add(
        "a demo account is required and set",
        detail?.attributes?.demoAccountRequired === true &&
          Boolean(detail?.attributes?.demoAccountName),
      );
    });
  }

  await attempt("age rating", async () => {
    const r = await api(`/ageRatingDeclarations/${DECLARATION_ID}`);
    const problems = ageRatingProblems(dataOf<Resource>(r).attributes ?? {});
    add("age rating declaration", problems.length === 0, problems.join("; "));
  });

  await attempt("content rights", async () => {
    const r = await api(`/apps/${APP_ID}?fields[apps]=contentRightsDeclaration`);
    add(
      "content rights declared",
      dataOf<Resource>(r).attributes?.contentRightsDeclaration === "USES_THIRD_PARTY_CONTENT",
    );
  });

  await attempt("subscription", async () => {
    const r = await api(`/subscriptions/${SUBSCRIPTION_ID}`);
    const state = String(dataOf<Resource>(r).attributes?.state ?? "");
    add(
      "subscription is not missing metadata",
      state !== "" && state !== "MISSING_METADATA",
      state,
    );
    const shot = await api(`/subscriptions/${SUBSCRIPTION_ID}/appStoreReviewScreenshot`);
    add("subscription has a review screenshot", Boolean(dataOf<Resource | null>(shot)?.id));
  });

  await attempt("beta review detail", async () => {
    const r = await api(`/apps/${APP_ID}/betaAppReviewDetail`);
    add(
      "TestFlight beta review demo account is set",
      Boolean(dataOf<Resource>(r).attributes?.demoAccountName),
    );
  });

  for (const c of checks)
    console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}${c.detail ? ` (${c.detail})` : ""}`);
  const failed = checks.filter((c) => !c.pass).length;
  console.log(failed === 0 ? "\nSUBMISSION CHECK OK" : `\nSUBMISSION CHECK: ${failed} FAIL`);
  if (failed > 0) process.exitCode = 1;
}

async function main() {
  if (cmd === "builds") {
    for (const b of await listBuilds()) {
      console.log(
        `${b.attributes.version}\t${b.attributes.processingState}\texpired=${b.attributes.expired}`,
      );
    }
  } else if (cmd === "expire-builds") {
    const max = Number(arg);
    if (!Number.isInteger(max) || max < 1)
      throw new Error("expire-builds needs the highest build number to expire, e.g. 49");
    const builds = await listBuilds();
    const newer = requireNewerValidBuild(builds, max); // never expire anything until a newer build is VALID
    const targets = buildsToExpire(builds, max);
    console.log(`Newer valid build: ${newer.attributes.version}`);
    console.log(
      `${APPLY ? "Expiring" : "Would expire"}: ${targets.map((b) => b.attributes.version).join(", ") || "(none)"}`,
    );
    if (!APPLY) return;
    for (const b of targets) {
      const r = await api(`/builds/${b.id}`, "PATCH", {
        data: { type: "builds", id: b.id, attributes: { expired: true } },
      });
      console.log(`${b.attributes.version}: ${r.ok ? "expired" : `FAILED ${r.status}`}`);
      if (!r.ok) process.exitCode = 1;
    }
  } else if (cmd === "attach-build") {
    const build = findBuild(await listBuilds(), Number(arg)); // the exact build, never "the latest"
    const version = await editableVersion();
    console.log(
      `${APPLY ? "Attaching" : "Would attach"} build ${build.attributes.version} to ${String(version.attributes?.versionString)} (${String(version.attributes?.appVersionState)})`,
    );
    if (!APPLY) return;
    const r = await api(`/appStoreVersions/${version.id}/relationships/build`, "PATCH", {
      data: { type: "builds", id: build.id },
    });
    if (!r.ok) throw new Error(`attach failed: ${r.status} ${JSON.stringify(r.json)}`);
    const check = await api(`/appStoreVersions/${version.id}/build`);
    console.log(`Attached now: ${String(dataOf<Resource | null>(check)?.attributes?.version)}`);
  } else if (cmd === "beta-review-info") {
    const cur = await api(`/apps/${APP_ID}/betaAppReviewDetail`);
    if (!cur.ok) throw new Error(`read failed: ${cur.status}`);
    const detail = dataOf<Resource>(cur);
    const wanted = {
      contactFirstName: "Shayan",
      contactLastName: "Salimi",
      contactEmail: need("REVIEW_CONTACT_EMAIL"),
      contactPhone: need("REVIEW_CONTACT_PHONE"),
      demoAccountName: need("DEMO_ACCOUNT_EMAIL"),
      demoAccountPassword: "No password. Tap Send code, then open the code page in the notes.",
      demoAccountRequired: true,
      notes: buildBetaReviewNotes({
        demoCodeURL: need("REVIEW_DEMO_CODE_URL"),
        reviewContactEmail: need("REVIEW_CONTACT_EMAIL"),
      }),
    };
    for (const k of Object.keys(wanted))
      console.log(`  ${k}: ${detail.attributes?.[k] ? "SET" : "(empty)"}`);
    if (!APPLY) return;
    const r = await api(`/betaAppReviewDetails/${detail.id}`, "PATCH", {
      data: { type: "betaAppReviewDetails", id: detail.id, attributes: wanted },
    });
    if (!r.ok) throw new Error(`write failed: ${r.status}`);
    const saved = dataOf<Resource>(r).attributes ?? {};
    for (const [k, v] of Object.entries(wanted))
      console.log(`  ${k}: ${saved[k] === v ? "OK" : "MISMATCH"}`);
  } else if (cmd === "content-rights") {
    const a = await api(`/apps/${APP_ID}?fields[apps]=contentRightsDeclaration`);
    console.log(
      `contentRightsDeclaration: ${String(dataOf<Resource>(a).attributes?.contentRightsDeclaration ?? "(unset)")}`,
    );
    if (!APPLY) return;
    const r = await api(`/apps/${APP_ID}`, "PATCH", {
      data: {
        type: "apps",
        id: APP_ID,
        attributes: { contentRightsDeclaration: "USES_THIRD_PARTY_CONTENT" },
      },
    });
    console.log(r.ok ? "content rights: OK" : `FAILED ${r.status} ${JSON.stringify(r.json)}`);
    if (!r.ok) process.exitCode = 1;
  } else if (cmd === "release-type") {
    const version = await editableVersion();
    console.log(`releaseType: ${String(version.attributes?.releaseType ?? "(unset)")}`);
    if (!APPLY) return;
    if (arg !== "MANUAL" && arg !== "AFTER_APPROVAL")
      throw new Error("release-type MANUAL|AFTER_APPROVAL");
    const r = await api(`/appStoreVersions/${version.id}`, "PATCH", {
      data: { type: "appStoreVersions", id: version.id, attributes: { releaseType: arg } },
    });
    console.log(r.ok ? `releaseType: ${arg}` : `FAILED ${r.status}`);
    if (!r.ok) process.exitCode = 1;
  } else if (cmd === "submission-check") {
    await submissionCheck();
  } else {
    console.log("Usage: see the header of this file");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
