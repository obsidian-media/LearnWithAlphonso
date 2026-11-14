import { describe, expect, it } from "vitest";
import { HELP_TOPICS } from "@/data/help-centre";
import { HANDOFF_NOTICE } from "./support-ai.server";
import { SUPPORT_COPY, SUPPORT_STARTERS } from "./support-copy";

describe("Help chat copy (approved in the round 12 mock)", () => {
  it("has no empty string and no em dash", () => {
    for (const [key, value] of Object.entries(SUPPORT_COPY)) {
      expect(value.length, key).toBeGreaterThan(0);
      expect(value, key).not.toContain("—");
    }
  });

  it("the starters are the first seven help-file topic titles, in order", () => {
    expect(SUPPORT_STARTERS).toHaveLength(7);
    expect(SUPPORT_STARTERS).toEqual(HELP_TOPICS.slice(0, 7).map((t) => t.title));
    expect(SUPPORT_STARTERS[0]).toBe("Alphonso Pro");
    expect(SUPPORT_STARTERS[6]).toBe("Reporting and blocking");
  });

  it("the words the server also says are the same words", () => {
    expect(SUPPORT_COPY.unreachable).toBe(
      "We couldn't reach support. Your message is saved. Try again in a moment.",
    );
    expect(SUPPORT_COPY.dailyLimit).toBe(
      "You have reached today's limit of messages to Help. Try again tomorrow.",
    );
    expect(SUPPORT_COPY.conversationLimit).toBe(
      "This conversation has reached its message limit. A person will read what you have sent.",
    );
    expect(SUPPORT_COPY.loadFailed).toBe("Could not load your messages.");
    // The hand-off line is the server's: the screen never writes its own.
    expect(HANDOFF_NOTICE).toBe("A person will reply here.");
  });

  it("names no time and promises nothing", () => {
    const all = Object.values(SUPPORT_COPY).join(" ");
    expect(all).not.toMatch(/within \d+ (hours?|minutes?)/i);
    expect(all).not.toMatch(/we will (refund|fix|credit)/i);
  });
});
