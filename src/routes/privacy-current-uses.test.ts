import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// The privacy page must keep matching what the data is used for (#472, #497, #496): the time zone is the day boundary
// for streaks and daily totals, not just a display setting, and staff actions are recorded and outlive the account.
describe("privacy page: current data uses", () => {
  const page = fs
    .readFileSync(path.join(process.cwd(), "src", "routes", "privacy.tsx"), "utf8")
    .replace(/\s+/g, " ");

  it("says the time zone decides which day streaks and daily totals count towards", () => {
    expect(page).toMatch(/which calendar day your streak and daily totals count towards/);
    expect(page).toMatch(/if we do not have it, we use UTC/);
  });

  it("no longer says the time zone is only for showing dates", () => {
    expect(page).not.toMatch(/used only to show dates/);
  });

  it("describes the staff action record: what it holds, that it is not exported, that it outlives the account", () => {
    expect(page).toMatch(/Actions by our team:/);
    expect(page).toMatch(/not your lessons, answers or chats/);
    expect(page).toMatch(/not part of your data export/);
    expect(page).toMatch(/kept after your account is deleted/);
  });

  it("describes the Help chat: AI helper, what it sees, reply notices without text, retention, export", () => {
    expect(page).toMatch(/<Section heading="Help chat">/);
    expect(page).toMatch(/Miya, the helper that may answer first, is an AI/);
    expect(page).toMatch(/she cannot change anything on your account/);
    expect(page).toMatch(
      /a person takes over for billing, refunds, safety and questions about your data/,
    );
    expect(page).toMatch(/They never contain the text of the reply/);
    expect(page).toMatch(/deleted 12 months after it was solved/);
    expect(page).toMatch(/Your data export includes your Help conversations/);
    expect(page).toMatch(/leaves out our staff notes/);
  });

  it("lists Help chat in the processors that handle it", () => {
    expect(page).toMatch(/answers Help chat questions when the AI helper is switched on/);
    expect(page).toMatch(/the email that tells you a person has replied in Help/);
  });
});
