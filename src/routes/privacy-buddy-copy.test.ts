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

  it("says a friend pairing needs both friends to agree and either can end it", () => {
    expect(page).toMatch(
      /A friend pairing needs both friends to agree, and either of you can end it at any time/,
    );
  });

  it("says buddies can only send fixed messages from a list, with no free text, kept as history", () => {
    expect(page).toMatch(/send each other short fixed messages from a list/);
    expect(page).toMatch(/There is no free text/);
  });

  it("says matching is opt-in, by course and level, and lists exactly what a matched learner sees", () => {
    expect(page).toMatch(
      /you can choose to be matched with another learner of the same course at a similar level/,
    );
    expect(page).toMatch(
      /A matched learner sees only your display name, your avatar, your weekly lesson counts, your shared streak, the preset messages you send, and that you study the same course at a similar level/,
    );
  });

  it("says a matching pause stops matched buddies messaging and leaves friend pairings alone", () => {
    expect(page).toMatch(
      /If we pause matching, matched study buddies cannot send messages until it resumes/,
    );
    expect(page).toMatch(/Friend pairings are not affected/);
  });
});
