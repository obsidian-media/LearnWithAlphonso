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
 * Requires APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID,
 * APP_STORE_CONNECT_KEY_P8_BASE64 in the environment (same secrets as
 * check-subscription-status.ts), and AGE_RATING_DECLARATION_ID
 * (defaults to Learn With Alphonso's known declaration id).
 */
import { createSign } from "node:crypto";
import {
  AGE_RATING_ANSWERS,
  ageRatingPatch,
  ageRatingProblems,
  resolveComputedRating,
} from "../src/lib/app-store/age-rating";
import { pickEditableAppInfo } from "../src/lib/app-store/editable-version";

const KEY_ID = process.env.APP_STORE_CONNECT_KEY_ID;
const ISSUER_ID = process.env.APP_STORE_CONNECT_ISSUER_ID;
const KEY_P8_BASE64 = process.env.APP_STORE_CONNECT_KEY_P8_BASE64;
const APP_ID = process.env.APP_ID ?? "6813969159";
const DECLARATION_ID =
  process.env.AGE_RATING_DECLARATION_ID ?? "74c50170-c089-4201-8fb6-2e6155eae246";

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

/** The computed rating as the app info reports it; Apple may expose it there rather than on the declaration. */
async function appInfoRating(): Promise<string | undefined> {
  const r = await api(`/apps/${APP_ID}/appInfos`);
  if (!r.ok) return undefined;
  try {
    const info = pickEditableAppInfo(
      (r.json as { data: { id: string; attributes?: Record<string, string> }[] }).data,
    );
    return (info.attributes as Record<string, string> | undefined)?.appStoreAgeRating;
  } catch {
    return undefined;
  }
}

async function main() {
  const cmd = process.argv[2];
  console.log(`Age rating declaration id: ${DECLARATION_ID}`);

  if (cmd === "check") {
    const result = await api(`/ageRatingDeclarations/${DECLARATION_ID}`);
    console.log(`Status: ${result.status}`);
    console.log(JSON.stringify(result.json, null, 2));
    if (!result.ok) process.exit(1);
    const attributes = (result.json as { data: { attributes: Record<string, unknown> } }).data
      .attributes;
    const infoRating = await appInfoRating();
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
    const live = await api(`/ageRatingDeclarations/${DECLARATION_ID}`);
    if (!live.ok) {
      console.log(`Could not read the live declaration: ${live.status}`);
      process.exit(1);
    }
    const answers = ageRatingPatch(
      (live.json as { data: { attributes: Record<string, unknown> } }).data.attributes,
    );
    const skipped = Object.keys(AGE_RATING_ANSWERS).filter((k) => !(k in answers));
    if (skipped.length > 0)
      console.log(`Not in the live declaration, skipped: ${skipped.join(", ")}`);
    console.log("Applying:", JSON.stringify(answers, null, 2));
    const result = await api(`/ageRatingDeclarations/${DECLARATION_ID}`, "PATCH", {
      data: {
        type: "ageRatingDeclarations",
        id: DECLARATION_ID,
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
