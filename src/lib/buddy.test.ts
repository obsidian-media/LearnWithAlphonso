import { describe, expect, it } from "vitest";
import fixtures from "./buddy.fixtures.json";
import { BUDDY_GOAL, buddyStatusMessage, buddyWeekLine, resolveBuddyWeek } from "./buddy";

describe("resolveBuddyWeek", () => {
  for (const c of fixtures.resolve) {
    it(c.name, () =>
      expect(resolveBuddyWeek(c.state, c.counts, c.isFirstWeek)).toEqual(c.expected),
    );
  }
  it("uses the server's goal", () => expect(BUDDY_GOAL).toBe(3));
});

describe("buddyStatusMessage", () => {
  for (const [status, text] of Object.entries(fixtures.messages)) {
    it(status, () => expect(buddyStatusMessage(status)).toBe(text));
  }
  it("falls back for a status the client does not know", () => {
    expect(buddyStatusMessage("something_new")).toBe(fixtures.messages.unknown);
    expect(buddyStatusMessage("constructor")).toBe(fixtures.messages.unknown);
  });
});

describe("buddyWeekLine", () => {
  for (const c of fixtures.weekLines) {
    it(c.expected, () => expect(buddyWeekLine(c.my, c.buddy, c.goal)).toBe(c.expected));
  }
});
