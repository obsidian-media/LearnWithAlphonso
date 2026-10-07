import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// The privacy page must say what buddy_weeks actually keeps: per-week lesson counts, readable by both buddies and
// kept as history after the pair ends (review of PR feat/buddy-pairing: the first wording said only "this week").
describe("privacy page: study buddies", () => {
  const page = fs
    .readFileSync(path.join(process.cwd(), "src", "routes", "privacy.tsx"), "utf8")
    .replace(/\s+/g, " ");

  it("says each buddy sees the other's weekly lesson counts and that they are kept as history", () => {
    expect(page).toMatch(/study buddies, each of you can see the other's weekly lesson counts/);
    expect(page).toMatch(/kept as your pair's history after it ends/);
  });

  it("says only friends who both agree can pair and either can end it", () => {
    expect(page).toMatch(
      /Only friends who both agree can pair, and either of you can end it at any time/,
    );
  });
});
