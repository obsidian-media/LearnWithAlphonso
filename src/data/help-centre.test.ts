import { describe, expect, it } from "vitest";
import { SUPPORT_EMAIL } from "@/lib/legal-required-phrases";
import { HELP_ALLOWED_HOSTS, HELP_TOPICS, helpCentreText } from "./help-centre";

describe("help centre", () => {
  it("has the topics the agent is allowed to answer, each non-empty with a unique id", () => {
    expect(HELP_TOPICS.map((t) => t.id)).toEqual(
      expect.arrayContaining([
        "pro",
        "restore",
        "streak",
        "streak-freeze",
        "hands-free",
        "stories",
        "league",
        "account",
        "privacy",
        "safety",
      ]),
    );
    expect(new Set(HELP_TOPICS.map((t) => t.id)).size).toBe(HELP_TOPICS.length);
    for (const t of HELP_TOPICS) {
      expect(t.title.trim().length, t.id).toBeGreaterThan(0);
      expect(t.body.trim().length, `${t.id} body`).toBeGreaterThan(40);
    }
  });

  it("links only to allowlisted hosts and mentions no email but the support address", () => {
    const text = helpCentreText();
    for (const url of text.match(/https?:\/\/[^\s)]+/g) ?? []) {
      expect(HELP_ALLOWED_HOSTS, url).toContain(new URL(url).hostname);
      expect(url.startsWith("https://"), url).toBe(true);
    }
    for (const email of text.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? []) {
      expect(email).toBe(SUPPORT_EMAIL);
    }
  });

  it("states the streak-freeze rules the code runs (progress-math.ts, buy_streak_freeze_with_xp)", () => {
    const body = HELP_TOPICS.find((t) => t.id === "streak-freeze")!.body;
    expect(body).toMatch(/multiple of 10/);
    expect(body).toMatch(/75 XP/);
    expect(body).toMatch(/exactly one day/);
    expect(body).toMatch(/two or more days/);
    expect(body).toMatch(/Protected by a streak freeze/);
  });

  it("explains Rehearsals: free first one, what is kept, export, delete, and that there is no score", () => {
    const body = HELP_TOPICS.find((t) => t.id === "rehearsals")!.body;
    expect(body).toMatch(/first rehearsal is free/);
    expect(body).toMatch(/part of Alphonso Pro/);
    expect(body).toMatch(/never the words you said/);
    expect(body).toMatch(/data export/);
    expect(body).toMatch(/Delete this rehearsal/);
    expect(body).toMatch(/does not remove what each rehearsal call added to Alphonso's memory/);
    expect(body).toMatch(/clear Alphonso's memory in Settings/);
    expect(body).toMatch(/There is no score/);
  });

  it("never promises a refund, credit or time", () => {
    const text = helpCentreText().toLowerCase();
    expect(text).not.toMatch(/we will refund|you will be refunded|within \d+ (hours|days) we will/);
  });
});
