/**
 * Fails unless ios/LearnWithAlphonso/project.yml's app and widget versions match and its
 * CURRENT_PROJECT_VERSION is greater than every build App Store Connect has for this app (any version train,
 * processing, valid or expired). ios-release.yml runs it before archiving an upload.
 *
 * API mode needs APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID, APP_STORE_CONNECT_KEY_P8_BASE64
 * (the secrets ios-release.yml already has) and APP_ID (default 6813969159, as check-subscription-status.ts).
 * Offline mode, for tests and mutation runs: --asc-versions <file.json> (a JSON array of build numbers).
 *
 * Usage: bun scripts/check-ios-build-number.ts [--yml <project.yml>] [--asc-versions <file.json>]
 */
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  buildNumberProblem,
  compareBuildNumbers,
  projectVersions,
  versionMismatchProblems,
} from "../src/lib/ios-release-guards";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const ymlPath = flag("--yml") ?? "ios/LearnWithAlphonso/project.yml";
const offlineVersions = flag("--asc-versions");

function base64url(input: Buffer | string): string {
  return Buffer.from(input as string)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function makeJWT(): string {
  const {
    APP_STORE_CONNECT_KEY_ID: keyId,
    APP_STORE_CONNECT_ISSUER_ID: issuer,
    APP_STORE_CONNECT_KEY_P8_BASE64: p8,
  } = process.env;
  if (!keyId || !issuer || !p8)
    throw new Error("Missing APP_STORE_CONNECT_KEY_ID / _ISSUER_ID / _KEY_P8_BASE64");
  const now = Math.floor(Date.now() / 1000);
  const input = `${base64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }))}.${base64url(
    JSON.stringify({ iss: issuer, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" }),
  )}`;
  const signer = createSign("SHA256");
  signer.update(input);
  signer.end();
  const signature = signer.sign({
    key: Buffer.from(p8, "base64").toString("utf-8"),
    dsaEncoding: "ieee-p1363",
  });
  return `${input}.${base64url(signature)}`;
}

async function uploadedBuildNumbers(): Promise<string[]> {
  if (offlineVersions) return JSON.parse(readFileSync(offlineVersions, "utf8")) as string[];
  const appId = process.env.APP_ID ?? "6813969159";
  let url: string | undefined =
    `https://api.appstoreconnect.apple.com/v1/builds?filter[app]=${appId}&limit=200&fields[builds]=version`;
  const versions: string[] = [];
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${makeJWT()}` } });
    if (!res.ok)
      throw new Error(`App Store Connect GET builds: HTTP ${res.status} ${await res.text()}`);
    const body = (await res.json()) as {
      data: { attributes: { version: string } }[];
      links?: { next?: string };
    };
    versions.push(...body.data.map((b) => b.attributes.version));
    url = body.links?.next;
  }
  return versions;
}

async function main() {
  const yml = readFileSync(ymlPath, "utf8");
  const problems = versionMismatchProblems(yml);
  const local = projectVersions(yml).app.build ?? "";
  const uploaded = await uploadedBuildNumbers();
  const latest = uploaded.reduce<string | null>(
    (max, v) => (max === null || compareBuildNumbers(v, max) > 0 ? v : max),
    null,
  );
  console.log(
    `project.yml build ${local}; App Store Connect has ${uploaded.length} build(s), latest ${latest ?? "none"}.`,
  );
  const buildProblem = buildNumberProblem(local, uploaded);
  if (buildProblem) problems.push(buildProblem);
  for (const p of problems) console.error(`::error::${p}`);
  if (problems.length === 0) console.log("OK: versions match and the build number is new.");
  process.exit(problems.length ? 1 : 0);
}

main().catch((err) => {
  console.error(`::error::${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
