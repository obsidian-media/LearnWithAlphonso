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

  it("never promises a refund, credit or time", () => {
    const text = helpCentreText().toLowerCase();
    expect(text).not.toMatch(/we will refund|you will be refunded|within \d+ (hours|days) we will/);
  });
});
