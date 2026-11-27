import { describe, expect, it } from "vitest";
import { rehearsalPathInput } from "./rehearsal-path";
import type { RunMemory } from "./rehearsal-rules";

const run = (stage: RunMemory["stage"], finishedAt: string, corrections: string[] = []) => ({
  stage,
  finishedAt,
  momentsShown: [],
  wentWell: [],
  corrections,
});

const row = { id: "r1", event_kind: "interview" as const, event_date: "2026-12-01" };

describe("rehearsalPathInput: what the path engine is told about the active rehearsal", () => {
  it("is the next stage and no last run before any run", () => {
    expect(rehearsalPathInput(row, [], null)).toEqual({
      id: "r1",
      eventKind: "interview",
      eventDate: "2026-12-01",
      nextStage: "warmup",
      allDone: false,
      lastRunDay: null,
    });
  });

  it("moves on to the next undone stage, and notes that all are done", () => {
    const some = rehearsalPathInput(row, [run("warmup", "2026-11-20T10:00:00Z")], null);
    expect(some.nextStage).toBe("conversation");
    expect(some.allDone).toBe(false);
    const all = rehearsalPathInput(
      row,
      [
        run("warmup", "2026-11-20T10:00:00Z"),
        run("conversation", "2026-11-21T10:00:00Z", ["a", "b"]),
        run("hard_moments", "2026-11-22T10:00:00Z"),
      ],
      null,
    );
    expect(all.allDone).toBe(true);
    expect(all.nextStage).toBe("conversation"); // the weakest: the most corrections in its last run
  });

  it("dates the last run on the learner's own calendar day, not UTC", () => {
    // 23:30 UTC on the 20th is already the 21st in Auckland.
    const input = rehearsalPathInput(
      row,
      [run("warmup", "2026-11-20T23:30:00Z")],
      "Pacific/Auckland",
    );
    expect(input.lastRunDay).toBe("2026-11-21");
    expect(rehearsalPathInput(row, [run("warmup", "2026-11-20T23:30:00Z")], null).lastRunDay).toBe(
      "2026-11-20",
    );
  });
});
