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
});
