import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { SUPPORT_FACT_KEYS } from "../lib/support-facts.server";
import { FORCED_HANDOFF_ROWS } from "../lib/support-ai.server";

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
      /a person takes over for billing and refunds, deleting an account, safety, legal and data requests, any change to your account, anything she cannot answer/,
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

  // One phrase on the page per fact key. A key added to the AI facts has no phrase here, so this fails until the page
  // names it.
  const FACT_PHRASES: Record<(typeof SUPPORT_FACT_KEYS)[number], RegExp> = {
    pro: /whether you have Pro, where it came from and, for free Pro we gave you, the day it ends \(or that we could not check your Pro status\)/,
    course: /your course and level/,
    level: /your course and level/,
    streak: /your streak/,
    daysActiveLast30: /how many days you were active in the last 30/,
    lastActiveDay: /the last day you were active/,
    lessonsLast7Days: /how many lessons you finished in the last 7/,
    lastLessonDay: /the day of your last lesson/,
    platforms: /which platforms you use/,
    socialBlocked: /whether social features are blocked on your account \(yes or no, never why\)/,
    previousTickets: /the status, topic and day of up to three earlier Help conversations/,
  };

  it("names every fact the AI helper is given", () => {
    expect(Object.keys(FACT_PHRASES).sort()).toEqual([...SUPPORT_FACT_KEYS].sort());
    for (const key of SUPPORT_FACT_KEYS) expect(page, key).toMatch(FACT_PHRASES[key]);
  });

  const HANDOVER_PHRASES: Record<string, RegExp> = {
    "sensitive_topic:billing": /billing and refunds/,
    "sensitive_topic:account": /deleting an account/,
    "sensitive_topic:privacy": /legal and data requests/,
    "sensitive_topic:other": /safety/,
    "learner_asked:other": /whenever you ask for one/,
  };

  it("names every topic that always goes to a person, and the catch-alls", () => {
    expect(Object.keys(HANDOVER_PHRASES).sort()).toEqual([...FORCED_HANDOFF_ROWS].sort());
    for (const row of FORCED_HANDOFF_ROWS) expect(page, row).toMatch(HANDOVER_PHRASES[row]);
    expect(page).toMatch(/any change to your account, anything she cannot answer/);
  });
});
