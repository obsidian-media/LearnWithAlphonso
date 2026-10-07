// scripts/check-legal-live.ts
/**
 * Checks the PUBLIC legal pages as App Review and crawlers see them: one plain
 * GET each (no JavaScript, no redirects), body text only (see htmlToText).
 *
 *   bun scripts/check-legal-live.ts                      # production
 *   LEGAL_BASE_URL=https://<preview>.vercel.app bun scripts/check-legal-live.ts
 *
 * Exit code 1 on any failure. Run it after a change to the legal pages deploys,
 * and again before each App Store submission. Some sentences on these pages
 * describe behaviour that ships in later changes; the pull request that wrote
 * them lists those sentences so each one can be re-checked against the code
 * before submission.
 */
import {
  LEGAL_FORBIDDEN_PHRASES,
  LEGAL_REQUIRED_PHRASES,
  htmlToText,
  type LegalPath,
} from "../src/lib/legal-required-phrases";

const BASE = (process.env.LEGAL_BASE_URL ?? "https://learn.alphonsoecosystem.app").replace(
  /\/$/,
  "",
);
let failures = 0;

function fail(message: string): void {
  failures++;
  console.error(`FAIL ${message}`);
}

for (const path of Object.keys(LEGAL_REQUIRED_PHRASES) as LegalPath[]) {
  const res = await fetch(BASE + path, { redirect: "manual", headers: { accept: "text/html" } });
  if (res.status !== 200) {
    fail(`${path}: HTTP ${res.status} (expected 200, no redirect)`);
    continue;
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.includes(0)) fail(`${path}: raw NUL byte in HTML (binary to curl/grep)`);
  const text = htmlToText(new TextDecoder().decode(bytes));
  for (const phrase of LEGAL_REQUIRED_PHRASES[path]) {
    if (!text.includes(phrase)) fail(`${path}: missing "${phrase}"`);
  }
  for (const phrase of LEGAL_FORBIDDEN_PHRASES[path]) {
    if (text.includes(phrase)) fail(`${path}: still says "${phrase}"`);
  }
  console.log(`checked ${path} (${text.length} chars of body text)`);
}

if (failures > 0) {
  console.error(`${failures} legal-page check(s) failed against ${BASE}`);
  process.exit(1);
}
console.log(`All legal pages OK at ${BASE}`);
