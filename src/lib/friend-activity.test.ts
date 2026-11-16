import { describe, expect, it } from "vitest";
import {
  activityCopy,
  activityIcon,
  activityName,
  type FriendActivityEvent,
} from "./friend-activity";

const base: FriendActivityEvent = {
  id: "e1",
  userId: "u1",
  eventType: "lesson_completed",
  createdAt: "2026-11-15T10:00:00Z",
  xpGain: null,
  streak: null,
  newTier: null,
};

describe("activityCopy (the words iOS and Android use)", () => {
  it("lesson completed with its XP, 0 when the payload has none", () => {
    expect(activityCopy({ ...base, xpGain: 20 }, "Mina")).toBe("Mina completed a lesson (+20 XP)");
    expect(activityCopy(base, "Mina")).toBe("Mina completed a lesson (+0 XP)");
  });

  it("streak milestone with its days", () => {
    expect(activityCopy({ ...base, eventType: "streak_milestone", streak: 7 }, "Jon")).toBe(
      "Jon hit a 7-day streak",
    );
  });

  it("league promotion by the tier's display name, never the database key", () => {
    expect(
      activityCopy({ ...base, eventType: "league_promotion", newTier: "sapphire" }, "Priya"),
    ).toBe("Priya moved up to Grove");
    expect(activityCopy({ ...base, eventType: "league_promotion", newTier: "silver" }, "You")).toBe(
      "You moved up to Sapling",
    );
  });

  it("an unknown tier is capitalised, a missing one reads as 'a new league'", () => {
    expect(activityCopy({ ...base, eventType: "league_promotion", newTier: "obsidian" }, "A")).toBe(
      "A moved up to Obsidian",
    );
    expect(activityCopy({ ...base, eventType: "league_promotion" }, "A")).toBe(
      "A moved up to a new league",
    );
    expect(
      activityCopy({ ...base, eventType: "league_promotion", newTier: "constructor" }, "A"),
    ).toBe("A moved up to Constructor");
  });

  it("an event type this build does not know still reads", () => {
    expect(activityCopy({ ...base, eventType: "made_a_cake" }, "Mina")).toBe("Mina made progress");
  });
});

describe("activityIcon and activityName", () => {
  it("one 3D icon per kind, sparkles for the unknown", () => {
    expect(activityIcon("lesson_completed")).toBe("check_mark_button");
    expect(activityIcon("streak_milestone")).toBe("fire");
    expect(activityIcon("league_promotion")).toBe("trophy");
    expect(activityIcon("mystery")).toBe("sparkles");
  });

  it("'You' for the learner, the friend's name, or 'A friend'", () => {
    const friends = [{ userId: "f", displayName: "Mina" }];
    expect(activityName("me", "me", friends)).toBe("You");
    expect(activityName("f", "me", friends)).toBe("Mina");
    expect(activityName("x", "me", friends)).toBe("A friend");
    expect(activityName("me", null, friends)).toBe("A friend");
  });
});
