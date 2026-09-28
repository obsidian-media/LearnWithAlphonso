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

const KEY_ID = process.env.APP_STORE_CONNECT_KEY_ID;
const ISSUER_ID = process.env.APP_STORE_CONNECT_ISSUER_ID;
const KEY_P8_BASE64 = process.env.APP_STORE_CONNECT_KEY_P8_BASE64;
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

// The specific, honest answers per docs/BACKLOG.md sec 0.0y's reasoning.
// "contests" covers the competitive/social features (leaderboards,
// leagues, teams, duels) -- present and real, but not high-stakes/
// intense, so INFREQUENT_OR_MILD rather than FREQUENT_OR_INTENSE.
const HONEST_ANSWERS = {
  userGeneratedContent: true,
  messagingAndChat: true,
  contests: "INFREQUENT_OR_MILD",
};

async function main() {
  const cmd = process.argv[2];
  console.log(`Age rating declaration id: ${DECLARATION_ID}`);

  if (cmd === "check") {
    const result = await api(`/ageRatingDeclarations/${DECLARATION_ID}`);
    console.log(`Status: ${result.status}`);
    console.log(JSON.stringify(result.json, null, 2));
    return;
  }

  if (cmd === "apply") {
    console.log("Applying:", JSON.stringify(HONEST_ANSWERS, null, 2));
    const result = await api(`/ageRatingDeclarations/${DECLARATION_ID}`, "PATCH", {
      data: {
        type: "ageRatingDeclarations",
        id: DECLARATION_ID,
        attributes: HONEST_ANSWERS,
      },
    });
    console.log(`Status: ${result.status}`);
    console.log(JSON.stringify(result.json, null, 2));
    if (result.ok) {
      console.log("\n✅ SUCCESS -- re-run \"check\" to confirm the resulting appStoreAgeRating tier.");
    } else {
      console.log("\n❌ FAILED -- read the error body above (likely an invalid field name or enum value).");
      process.exit(1);
    }
    return;
  }

  console.log('Usage: tsx scripts/update-age-rating.ts <check|apply>');
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
