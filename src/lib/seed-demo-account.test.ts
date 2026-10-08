import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// scripts/seed-demo-account.ts runs on import (it talks to production), so this
// reads its source. The property guarded is WHICH table receives the CEFR level.
const source = readFileSync(new URL("../../scripts/seed-demo-account.ts", import.meta.url), "utf8");

const userAt = source.indexOf('from("user_progress").upsert(');
const languageAt = source.indexOf('from("language_progress").upsert(');
const userBlock = source.slice(userAt, languageAt);
const languageBlock = source.slice(languageAt, languageAt + 2500);

describe("seed-demo-account", () => {
  it("finds both upserts", () => {
    expect(userAt).toBeGreaterThan(-1);
    expect(languageAt).toBeGreaterThan(userAt);
  });

  it("writes the CEFR level to language_progress, which both apps read", () => {
    expect(languageBlock).toMatch(/cefr_level: "B2"/);
  });

  it("does not write the frozen user_progress.cefr_level", () => {
    expect(userBlock).not.toContain("cefr_level");
  });

  it("gives the demo account a chosen public name, so the reviewer lands on Learn and not the name prompt", () => {
    expect(source).toMatch(
      /from\("profiles"\)\s*\.update\(\{ display_name: "Alex", name_confirmed_at: new Date\(\)\.toISOString\(\) \}\)/,
    );
  });
});
