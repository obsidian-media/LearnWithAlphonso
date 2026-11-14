import { describe, expect, it } from "vitest";
import type { SupportMessage, SupportStatus } from "./support-client";
import {
  BANNER_COPY,
  bannerFor,
  composerFor,
  dayKey,
  dayLabel,
  shouldPoll,
  timeLabel,
  unreadDividerId,
} from "./support-view";

const online = { aiAvailable: false, aiDeclined: false, online: true };

describe("the status word the learner reads", () => {
  it.each<[SupportStatus, string]>([
    ["new", "With our team"],
    ["open", "With our team"],
    ["waiting_learner", "Waiting for your reply"],
    ["solved", "Solved"],
  ])("%s reads %s", (status, title) => {
    const kind = bannerFor({ status, ...online });
    expect(BANNER_COPY[kind!].title).toBe(title);
  });

  it("the AI banner only while a conversation is with the AI (or not started) and AI answers are on", () => {
    for (const status of ["none", "ai"] as const) {
      expect(bannerFor({ status, aiAvailable: true, aiDeclined: false, online: true })).toBe("ai");
      expect(bannerFor({ status, aiAvailable: true, aiDeclined: true, online: true })).toBe(
        "declined",
      );
      expect(bannerFor({ status, aiAvailable: false, aiDeclined: false, online: true })).toBe(
        "person",
      );
    }
    // Once a person has it, AI availability changes nothing.
    expect(bannerFor({ status: "open", aiAvailable: true, aiDeclined: false, online: true })).toBe(
      "team",
    );
  });

  it("offline wins over everything; no banner before the first load", () => {
    expect(bannerFor({ status: "solved", ...online, online: false })).toBe("offline");
    expect(bannerFor({ status: null, ...online })).toBeNull();
  });
});

describe("the composer", () => {
  const base = { limit: null, online: true, aiFirstOpen: false } as const;
  it("says what writing does in each state", () => {
    expect(composerFor({ ...base, status: "none" }).placeholder).toBe("Write your message");
    expect(composerFor({ ...base, status: "open" }).placeholder).toBe("Add something");
    expect(composerFor({ ...base, status: "new" }).placeholder).toBe("Add something");
    expect(composerFor({ ...base, status: "waiting_learner" }).placeholder).toBe(
      "Reply to Alphonso support",
    );
    const solved = composerFor({ ...base, status: "solved" });
    expect(solved.placeholder).toBe("Still need help? Write here");
    expect(solved.fine).toContain("within 7 days");
  });
  it("the daily limit and a full chat close the box with their reason", () => {
    const day = composerFor({ ...base, status: "open", limit: "daily" });
    expect(day).toMatchObject({ disabled: true, fine: "Limit: 50 messages a day." });
    const full = composerFor({ ...base, status: "open", limit: "conversation" });
    expect(full).toMatchObject({ disabled: true, placeholder: "This chat is full" });
  });
  it("offline keeps the draft note; the AI first open has the longer note", () => {
    expect(composerFor({ ...base, status: "open", online: false }).fine).toBe(
      "Your draft is kept on this device.",
    );
    expect(composerFor({ ...base, status: "none", aiFirstOpen: true }).fine).toMatch(
      /^Answers can be wrong/,
    );
  });
});

describe("polling", () => {
  it("polls unless the AI has the conversation (or nothing has loaded)", () => {
    expect(shouldPoll("ai")).toBe(false);
    expect(shouldPoll(null)).toBe(false);
    for (const s of ["none", "new", "open", "waiting_learner", "solved"] as const)
      expect(shouldPoll(s)).toBe(true);
  });
});

const msg = (id: number, kind: SupportMessage["kind"]): SupportMessage => ({
  id,
  kind,
  body: "x",
  at: "2026-11-14T10:00:00Z",
  link: null,
});

describe("the New reply divider", () => {
  const ms = [
    msg(1, "you"),
    msg(2, "support"),
    msg(3, "you"),
    msg(4, "support"),
    msg(5, "support"),
  ];
  it("goes before the first of the unread person replies", () => {
    expect(unreadDividerId(ms, 1)).toBe(5);
    expect(unreadDividerId(ms, 2)).toBe(4);
    expect(unreadDividerId(ms, 3)).toBe(2);
    expect(unreadDividerId(ms, 99)).toBe(2);
  });
  it("is absent when nothing is unread or there is no person reply", () => {
    expect(unreadDividerId(ms, 0)).toBeNull();
    expect(unreadDividerId([msg(1, "you")], 1)).toBeNull();
  });
});

describe("dates", () => {
  const now = new Date(2026, 10, 14, 15, 0); // Sat 14 Nov 2026, local time
  const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).toISOString();
  it("day labels", () => {
    expect(dayLabel(at(14, 9), now)).toBe("Today");
    expect(dayLabel(at(13, 9), now)).toBe("Yesterday");
    expect(dayLabel(at(2, 9), now)).toBe("Nov 2");
  });
  it("time labels: clock today, weekday this week, date before", () => {
    expect(timeLabel(at(14, 9, 41), now)).toBe("9:41 AM");
    expect(timeLabel(at(11, 11, 12), now)).toBe("Wed 11:12 AM");
    expect(timeLabel(at(2, 10, 2), now)).toBe("Nov 2, 10:02 AM");
  });
  it("dayKey splits on the calendar day", () => {
    expect(dayKey(at(14, 1))).toBe(dayKey(at(14, 23)));
    expect(dayKey(at(14, 1))).not.toBe(dayKey(at(13, 23)));
  });
});
