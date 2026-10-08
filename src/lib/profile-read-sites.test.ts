import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// RLS limits direct reads of public.profiles to the caller's own row. A new direct read of
// ANOTHER learner's row would silently return nothing and blank a screen. Every direct table access is listed here
// with its count; changing a count means: confirm the new site reads only the caller's own row (or uses the service
// role), then update this map in the same PR. Cross-user reads go through the SECURITY DEFINER RPCs instead.
const ROOTS = [
  "src",
  "admin",
  "supabase/functions",
  "ios/LearnWithAlphonsoKit/Sources",
  "ios/LearnWithAlphonso/Sources",
  "android/LearnWithAlphonso",
];
const PATTERNS: RegExp[] = [
  /\.from\(\s*["']profiles["']\s*\)/g, // supabase-js (web, admin, edge)
  /restRequest\(\s*path:\s*"profiles"/g, // iOS Kit PostgREST
  /http\.rest\([^)]*?"profiles"/g, // Android core PostgREST
];
const EXPECTED_SITES: Record<string, number> = {
  "src/lib/ai-consent.server.ts": 1, // ai_consent_at, own row only (user client) or by id (service role)
  "supabase/functions/_shared/ai-consent.ts": 1, // ai_consent_at by id (service role)
  "src/lib/leaderboard.functions.ts": 2, // updateProfile (own), getMyProfile (own)
  "src/lib/account.functions.ts": 1, // GDPR export (own, user client)
  "src/lib/admin.functions.ts": 1, // admin reports (service role)
  "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/ProgressSyncClient+DisplayIdentity.swift": 3, // own GET + 2 PATCH
  // 3 = own theme GET + PATCH, plus the PATCH shape quoted in the file's doc comment (line 13).
  "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/ProgressSyncClient+Profile.swift": 3,
  "android/LearnWithAlphonso/core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/net/SocialClient.kt": 3,
  "android/LearnWithAlphonso/core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/net/ProgressSyncClient.kt": 2,
};

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "build" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (
      /\.(ts|tsx|swift|kt)$/.test(e.name) &&
      !/\.test\.tsx?$|Tests?\.(swift|kt)$|\/test\//.test(p.replace(/\\/g, "/"))
    )
      out.push(p);
  }
  return out;
}

describe("direct reads of public.profiles", () => {
  it("match the reviewed list of own-row and service-role sites", () => {
    const found: Record<string, number> = {};
    for (const root of ROOTS) {
      for (const file of walk(path.join(process.cwd(), root))) {
        const text = fs.readFileSync(file, "utf8");
        const n = PATTERNS.reduce((acc, re) => acc + [...text.matchAll(re)].length, 0);
        if (n) found[path.relative(process.cwd(), file).replace(/\\/g, "/")] = n;
      }
    }
    expect(found).toEqual(EXPECTED_SITES);
    // Walks web, admin, edge, iOS and Android sources: allow for a slow disk or a loaded CI runner.
  }, 30_000);
});
