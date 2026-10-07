import { describe, expect, it } from "vitest";
import fixtures from "./buddy.fixtures.json";
import {
  BUDDY_COPY,
  BUDDY_MESSAGES_PER_HOUR,
  BUDDY_PRESETS,
  buddyMessageLine,
  buddyPresetText,
  BUDDY_GOAL,
  buddyEndConfirm,
  buddyGraceLine,
  buddyIncomingLine,
  buddyOutgoingLine,
  buddyStatusMessage,
  buddyStreakLine,
  buddyWeekLine,
  resolveBuddyWeek,
} from "./buddy";

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

describe("card wording (shared with iOS and Android)", () => {
  const c = fixtures.copy;
  it("intro and load failure", () => {
    expect(BUDDY_COPY.intro).toBe(c.intro);
    expect(BUDDY_COPY.loadFailed).toBe(c.loadFailed);
  });
  for (const s of c.streakLines) {
    it(s.expected, () => expect(buddyStreakLine(s.weeks)).toBe(s.expected));
  }
  for (const g of c.graceLines) {
    it(g.expected, () => expect(buddyGraceLine(g.available)).toBe(g.expected));
  }
  it("request and end lines", () => {
    expect(buddyIncomingLine(c.incoming.name)).toBe(c.incoming.expected);
    expect(buddyOutgoingLine(c.outgoing.name)).toBe(c.outgoing.expected);
    expect(buddyEndConfirm(c.endConfirm.name)).toBe(c.endConfirm.expected);
  });
});

describe("preset messages (shared with iOS and Android)", () => {
  it("are exactly the fixture presets, in order", () => {
    expect(BUDDY_PRESETS).toEqual(fixtures.presets);
    for (const p of fixtures.presets) expect(buddyPresetText(p.id)).toBe(p.text);
    expect(buddyPresetText("hi there")).toBeNull();
    expect(BUDDY_MESSAGES_PER_HOUR).toBe(fixtures.messagesPerHour);
  });
  for (const l of fixtures.messageLines) {
    it(`${l.presetId} -> ${l.expected}`, () =>
      expect(buddyMessageLine(l.isMine, l.buddyName, l.presetId)).toBe(l.expected));
  }
});
