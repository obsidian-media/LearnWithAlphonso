/**
 * Fixes the age rating declaration that docs/BACKLOG.md section 0.0y
 * (PR #177, 2026-09-26) decided was wrong: the questionnaire was
 * under-answered (userGeneratedContent/messagingAndChat/contests all
 * false/NONE), producing a live 4+ rating that contradicts the app's
 * own privacy policy ("not intended for children under 13") and the
 * real product (public leaderboards/leagues/teams/duels, AI chat that
 * can be wrong or inappropriate, Block/Report moderation on every
 * surface showing another person).
 *
 * This only PATCHes the specific fields the backlog's reasoning
 * actually covers -- it does not touch ageRatingOverride/V2 (Apple
 * computes the resulting tier from the descriptor fields itself, not
 * from a value this script sets), and does not touch anything
 * unrelated (violence, sexual content, substances, etc. all stay
 * NONE/false, which is accurate).
 *
 * The exact current field names/values below were read live from this
 * app's real ageRatingDeclarations record (id below) via the
 * "check-app-store-status.yml" workflow's read-only app-info job,
 * 2026-09-28 -- not guessed from documentation, which would not render
 * for automated fetching at the time this was written.
 *
 * The answers live in src/lib/app-store/age-rating.ts. "check" prints the
 * live declaration, then every difference from those answers (and a computed
 * rating below 13+), and exits 1 on any problem. "apply" PATCHes only the
 * fields the live declaration actually has.
 *
 * Usage:
 *   node_modules/.bin/tsx scripts/update-age-rating.ts check
 *   node_modules/.bin/tsx scripts/update-age-rating.ts apply
 *
 * The declaration is read through the editable app info
 * (GET /v1/appInfos/{id}/ageRatingDeclaration); App Store Connect no longer
 * allows GET on /v1/ageRatingDeclarations/{id}. Apply PATCHes that id.
 *
 * Requires APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID,
 * APP_STORE_CONNECT_KEY_P8_BASE64 in the environment (same secrets as
 * check-subscription-status.ts).
 */
import { createSign } from "node:crypto";
import {
  AGE_RATING_ANSWERS,
  ageRatingDeclarationReadPath,
  ageRatingPatch,
  ageRatingProblems,
  parseAgeRatingDeclaration,
  resolveComputedRating,
} from "../src/lib/app-store/age-rating";
import { pickEditableAppInfo } from "../src/lib/app-store/editable-version";

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
  method: "GET" | "PATCH" = "GET",
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

type AppInfoResource = { id: string; attributes?: Record<string, string> };

/** The live declaration (read through the editable app info) and the rating that app info reports. */
async function readDeclaration(): Promise<{
  id: string;
  attributes: Record<string, unknown>;
  infoRating?: string;
}> {
  const infos = await api(`/apps/${APP_ID}/appInfos`);
  if (!infos.ok) {
    console.log(`Could not read the app infos: ${infos.status}`);
    console.log(JSON.stringify(infos.json, null, 2));
    process.exit(1);
  }
  const info = pickEditableAppInfo((infos.json as { data: AppInfoResource[] }).data);
  const result = await api(ageRatingDeclarationReadPath(info.id));
  console.log(`Status: ${result.status}`);
  console.log(JSON.stringify(result.json, null, 2));
  if (!result.ok) process.exit(1);
  const declaration = parseAgeRatingDeclaration(result.json);
  console.log(`Age rating declaration id: ${declaration.id}`);
  return { ...declaration, infoRating: info.attributes?.appStoreAgeRating };
}

async function main() {
  const cmd = process.argv[2];

  if (cmd === "check") {
    const { attributes, infoRating } = await readDeclaration();
    const { rating, source } = resolveComputedRating(attributes, infoRating);
    console.log(`Computed rating: ${rating || "(none)"} (source: ${source})`);
    const problems = ageRatingProblems(attributes, infoRating);
    for (const problem of problems) console.log(`  PROBLEM: ${problem}`);
    console.log(
      problems.length === 0 ? "AGE RATING OK" : `AGE RATING PROBLEMS: ${problems.length}`,
    );
    if (problems.length > 0) process.exit(1);
    return;
  }

  if (cmd === "apply") {
    const live = await readDeclaration();
    const answers = ageRatingPatch(live.attributes);
    const skipped = Object.keys(AGE_RATING_ANSWERS).filter((k) => !(k in answers));
    if (skipped.length > 0)
      console.log(`Not in the live declaration, skipped: ${skipped.join(", ")}`);
    console.log("Applying:", JSON.stringify(answers, null, 2));
    const result = await api(`/ageRatingDeclarations/${live.id}`, "PATCH", {
      data: {
        type: "ageRatingDeclarations",
        id: live.id,
        attributes: answers,
      },
    });
    console.log(`Status: ${result.status}`);
    console.log(JSON.stringify(result.json, null, 2));
    if (result.ok) {
      console.log(
        '\n✅ SUCCESS -- re-run "check" to confirm the resulting appStoreAgeRating tier.',
      );
    } else {
      console.log(
        "\n❌ FAILED -- read the error body above (likely an invalid field name or enum value).",
      );
      process.exit(1);
    }
    return;
  }

  console.log("Usage: tsx scripts/update-age-rating.ts <check|apply>");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
