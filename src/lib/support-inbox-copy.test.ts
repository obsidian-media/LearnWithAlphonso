import { describe, expect, it } from "vitest";
import {
  HANDOFF_LABELS,
  STATUS_LABELS,
  TOPIC_LABELS,
  ageLabel,
  assigneeLabel,
  courseName,
  ticketTitle,
} from "./support-inbox-copy";

describe("support inbox copy", () => {
  it("has a word for every status, topic and hand-off reason the database allows", () => {
    expect(Object.keys(STATUS_LABELS).sort()).toEqual(["new", "open", "solved", "waiting_learner"]);
    expect(Object.keys(TOPIC_LABELS).sort()).toEqual([
      "account",
      "billing",
      "bug",
      "league",
      "other",
      "privacy",
      "pro",
      "restore",
      "streak",
    ]);
    expect(Object.keys(HANDOFF_LABELS).sort()).toEqual([
      "ai_error",
      "ai_unavailable",
      "ai_unsure",
      "learner_asked",
      "quota",
      "sensitive_topic",
    ]);
  });

  it("ages read the way the mock draws them", () => {
    const now = Date.parse("2026-11-14T12:00:00Z");
    expect(ageLabel("2026-11-14T11:48:00Z", now)).toBe("12 min ago");
    expect(ageLabel("2026-11-14T10:00:00Z", now)).toBe("2 h ago");
    expect(ageLabel("2026-11-13T09:00:00Z", now)).toBe("Yesterday");
    expect(ageLabel("2026-11-14T11:59:50Z", now)).toBe("Just now");
    expect(ageLabel("nonsense", now)).toBe("");
  });

  it("names the owner of a ticket: Unassigned, You, a name, or a neutral fallback", () => {
    expect(assigneeLabel({ assignedTo: null, assignedName: null }, "me")).toBe("Unassigned");
    expect(assigneeLabel({ assignedTo: "me", assignedName: "Sam" }, "me")).toBe("You");
    expect(assigneeLabel({ assignedTo: "x", assignedName: "Sam" }, "me")).toBe("Sam");
    expect(assigneeLabel({ assignedTo: "x", assignedName: null }, "me")).toBe(
      "Another staff member",
    );
  });

  it("titles a ticket by topic, with a fallback, and names the course", () => {
    expect(ticketTitle("billing")).toBe("Billing");
    expect(ticketTitle(null)).toBe("Support ticket");
    expect(courseName("fr")).toBe("French");
    expect(courseName("de")).toBe("de");
    expect(courseName(null)).toBeNull();
  });
});
