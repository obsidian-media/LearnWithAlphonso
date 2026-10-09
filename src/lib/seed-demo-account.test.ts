import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// scripts/seed-demo-account.ts runs on import (it talks to production), so this
// reads its source. The property guarded is WHICH table receives the CEFR level.
const source = readFileSync(new URL("../../scripts/seed-demo-account.ts", import.meta.url), "utf8");

const userAt = source.indexOf('from("user_progress").upsert(');
const languageAt = source.indexOf('from("language_progress").upsert(');
const userBlock = source.slice(userAt, source.indexOf("}),", userAt));
const languageBlock = source.slice(languageAt - 120, languageAt + 700);

describe("seed-demo-account", () => {
  it("finds both upserts", () => {
    expect(userAt).toBeGreaterThan(-1);
    expect(languageAt).toBeGreaterThan(userAt);
  });

  it("writes each course's CEFR level to language_progress, which both apps read", () => {
    expect(languageBlock).toMatch(/DEMO_SEED\.placements\.map/);
    expect(languageBlock).toMatch(/cefr_level: level/);
    expect(languageBlock).toMatch(/placement_level: level/);
  });

  it("does not write the frozen user_progress.cefr_level", () => {
    expect(userBlock).not.toContain("cefr_level");
  });

  it("gives the demo account a chosen public name, so the reviewer lands on Learn and not the name prompt", () => {
    expect(source).toMatch(
      /from\("profiles"\)\s*\.update\(\{\s*display_name: DEMO_SEED\.displayName,\s*name_confirmed_at: new Date\(\)\.toISOString\(\),/,
    );
  });

  it("resets the AI consent so the reviewer sees the consent sheet", () => {
    expect(source).toMatch(/ai_consent_at: null/);
  });

  it("looks the resume episode up by slug instead of hard-coding an id", () => {
    expect(source).toContain("resolveResumeEpisode");
    expect(source).toContain("pickResumeEpisode");
    expect(source).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  });

  it("pairs the demo account as a matched pair and keeps it out of the matching pool", () => {
    expect(source).toMatch(/rpc\("_create_buddy_pair"/);
    expect(source).toMatch(/_source: "match"/);
    expect(source).toMatch(/from\("buddy_pool"\)\s*\.delete\(\)\s*\.eq\("user_id", userId\)/);
    expect(source).toContain("assertDemoPaired(status");
  });

  it("clears the demo account's own pairing and pool row, not only the demo learner's", () => {
    expect(source).toContain("await clearDemoBuddyState(buddyId);");
    expect(source).toContain("await clearDemoBuddyState(demoUserId);");
  });

  it("checks every seed write for an error instead of ignoring the results", () => {
    expect(source).toMatch(/assertNoWriteErrors\("reset seeded rows", results\)/);
    expect(source).toMatch(/assertNoWriteErrors\("seed progress", results\)/);
    expect(source).toMatch(
      /const results = await Promise\.all\(\[\s*supabaseAdmin\.from\("lesson_completions"\)\.delete/,
    );
  });

  it("reads the seeded state back and fails before reporting success", () => {
    const verifyAt = source.indexOf("await verifyDemoSeed(userId, buddyId);");
    expect(verifyAt).toBeGreaterThan(-1);
    expect(verifyAt).toBeLessThan(source.indexOf("Seeded the demo account"));
    expect(source).toContain("demoSeedProblems(state, demoUserId, buddyId)");
    expect(source).toContain('from("buddy_pool_exclusions")');
  });

  it("excludes the demo account from stranger matching, idempotently", () => {
    expect(source).toMatch(/from\("buddy_pool_exclusions"\)\s*\.upsert\(/);
    expect(source).toContain('onConflict: "user_id"');
  });

  it("removes a block or report between the two demo accounts, in both directions, before pairing", () => {
    const pairAt = source.indexOf('rpc("_create_buddy_pair"');
    for (const call of [
      /from\("blocked_users"\)\.delete\(\)\.eq\("blocker", demoUserId\)\.eq\("blocked", buddyId\)/,
      /from\("blocked_users"\)\.delete\(\)\.eq\("blocker", buddyId\)\.eq\("blocked", demoUserId\)/,
      /from\("content_reports"\)\s*\.delete\(\)\s*\.eq\("reporter", demoUserId\)\s*\.eq\("reported", buddyId\)/,
      /from\("content_reports"\)\s*\.delete\(\)\s*\.eq\("reporter", buddyId\)\s*\.eq\("reported", demoUserId\)/,
    ]) {
      const m = call.exec(source);
      expect(m, String(call)).not.toBeNull();
      expect(m!.index).toBeLessThan(pairAt);
    }
  });

  it("never deletes block rows by one side only", () => {
    for (const m of source.matchAll(/from\("blocked_users"\)\.delete\(\)[^\n]*/g)) {
      expect(m[0]).toMatch(/\.eq\("blocker", \w+\)\.eq\("blocked", \w+\)/);
    }
  });

  it("explains why the preset inserts bypass send_buddy_message", () => {
    expect(source).toMatch(/Seed-only: these inserts deliberately bypass send_buddy_message/);
  });

  it("gives the demo learner no progress", () => {
    expect(source).not.toMatch(/from\("lesson_completions"\)\.upsert\([^)]*buddyId/);
    expect(source).toMatch(/from\("language_progress"\)\.delete\(\)\.eq\("user_id", buddyId\)/);
  });
});
