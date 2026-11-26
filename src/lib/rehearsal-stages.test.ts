import { describe, expect, it } from "vitest";
import {
  EVENT_KINDS,
  OUTCOME_MEMORY_LINES,
  applyOutcome,
  nextStage,
  stageProgress,
  type RunMemory,
  type Stage,
} from "./rehearsal-rules";

const run = (stage: Stage, finishedAt: string, corrections: string[] = []): RunMemory => ({
  stage,
  finishedAt,
  momentsShown: [],
  wentWell: [],
  corrections,
});

describe("stageProgress", () => {
  it("is todo for every stage with no runs", () => {
    expect(stageProgress([])).toEqual({
      warmup: "todo",
      conversation: "todo",
      hard_moments: "todo",
    });
  });

  it("a stage is done once it has any finished run", () => {
    expect(stageProgress([run("conversation", "2026-11-27T10:00:00Z")])).toEqual({
      warmup: "todo",
      conversation: "done",
      hard_moments: "todo",
    });
  });
});

describe("nextStage", () => {
  const next = (runs: RunMemory[]) => nextStage(stageProgress(runs), runs);

  it("follows the order warm-up, conversation, hard moments", () => {
    expect(next([])).toBe("warmup");
    expect(next([run("warmup", "2026-11-27T10:00:00Z")])).toBe("conversation");
    expect(
      next([run("warmup", "2026-11-27T10:00:00Z"), run("conversation", "2026-11-27T11:00:00Z")]),
    ).toBe("hard_moments");
  });

  it("skips a stage that is done even when an earlier one is not", () => {
    expect(next([run("conversation", "2026-11-27T10:00:00Z")])).toBe("warmup");
    expect(
      next([run("warmup", "2026-11-27T10:00:00Z"), run("hard_moments", "2026-11-27T11:00:00Z")]),
    ).toBe("conversation");
  });

  it("when all are done, the weakest stage: the most corrections in its LAST run", () => {
    const runs = [
      run("warmup", "2026-11-27T10:00:00Z", ["a", "b", "c", "d"]), // superseded by the later warm-up run
      run("warmup", "2026-11-28T10:00:00Z", ["a"]),
      run("conversation", "2026-11-27T11:00:00Z", ["a", "b"]),
      run("hard_moments", "2026-11-27T12:00:00Z", ["a", "b", "c"]),
    ];
    expect(next(runs)).toBe("hard_moments");
  });

  it("a tie goes to the earlier stage", () => {
    const runs = [
      run("warmup", "2026-11-27T10:00:00Z", ["a"]),
      run("conversation", "2026-11-27T11:00:00Z", ["a"]),
      run("hard_moments", "2026-11-27T12:00:00Z", ["a"]),
    ];
    expect(next(runs)).toBe("warmup");
  });

  it("does not depend on the order the runs are given in", () => {
    const runs = [
      run("warmup", "2026-11-28T10:00:00Z", ["a"]),
      run("warmup", "2026-11-27T10:00:00Z", ["a", "b", "c", "d"]),
      run("conversation", "2026-11-27T11:00:00Z", ["a", "b"]),
      run("hard_moments", "2026-11-27T12:00:00Z", ["a"]),
    ];
    expect(next(runs)).toBe("conversation");
    expect(next([...runs].reverse())).toBe("conversation");
  });
});

describe("applyOutcome (How did it go?)", () => {
  const active = { status: "active" as const, eventKind: "interview" as const };
  const TODAY = "2026-12-01";

  it.each(["well", "ok", "hard"] as const)(
    "%s closes the rehearsal with a fixed memory line",
    (choice) => {
      const r = applyOutcome(active, choice, undefined, TODAY);
      expect(r).toMatchObject({ ok: true, action: "close", outcome: { choice } });
      if (r.ok && r.action === "close") {
        expect(r.memoryText).toBe(OUTCOME_MEMORY_LINES.interview[choice]);
        expect(r.memoryText.length).toBeLessThanOrEqual(140);
      }
    },
  );

  it("a date sent along with a closing choice changes nothing", () => {
    expect(applyOutcome(active, "well", "2027-01-01", TODAY)).toEqual(
      applyOutcome(active, "well", undefined, TODAY),
    );
  });

  it("moved needs a future local date and keeps the rehearsal active", () => {
    expect(applyOutcome(active, "moved", "2026-12-15", TODAY)).toEqual({
      ok: true,
      action: "move",
      eventDate: "2026-12-15",
    });
    for (const bad of [TODAY, "2026-11-30", undefined, "2026-02-31", 5]) {
      expect(applyOutcome(active, "moved", bad, TODAY)).toEqual({
        ok: false,
        error: "invalid_date",
      });
    }
  });

  it("refuses an unknown choice, and a rehearsal that is already closed", () => {
    expect(applyOutcome(active, "great", undefined, TODAY)).toEqual({
      ok: false,
      error: "invalid_choice",
    });
    expect(applyOutcome({ ...active, status: "done" }, "well", undefined, TODAY)).toEqual({
      ok: false,
      error: "closed",
    });
    expect(applyOutcome({ ...active, status: "cancelled" }, "moved", "2026-12-15", TODAY)).toEqual({
      ok: false,
      error: "closed",
    });
  });

  it("every memory line is fixed text: one per event kind and outcome, no placeholders", () => {
    for (const kind of EVENT_KINDS)
      for (const c of ["well", "ok", "hard"] as const)
        expect(OUTCOME_MEMORY_LINES[kind][c]).toMatch(/^[A-Z][A-Za-z' ,:-]+$/);
  });
});
