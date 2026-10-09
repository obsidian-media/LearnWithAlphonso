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
    expect(source).toContain("assertDemoPaired");
  });
});
