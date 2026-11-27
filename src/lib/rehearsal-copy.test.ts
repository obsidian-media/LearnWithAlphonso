import { describe, expect, it } from "vitest";
import { debriefTitle, paywallSummary } from "./rehearsal-copy";
import { EVENT_KINDS } from "./rehearsal-rules";

const done = (over = {}) => ({
  eventKind: "interview" as const,
  runs: 6,
  stagesDone: 3,
  corrections: 4,
  ...over,
});

describe("what the Pro sheet says the learner already did", () => {
  it("names the event, the stages, the runs and the corrected forms", () => {
    expect(paywallSummary(done())).toBe(
      "You rehearsed your interview with Alphonso (AI): all 3 stages, 6 runs, and 4 mistakes sent to Fix before it sticks. A new rehearsal, for a meeting, a landlord or a first day, needs Pro.",
    );
  });

  it("says one run and one stage in the singular, and leaves out what is zero", () => {
    expect(paywallSummary(done({ runs: 1, stagesDone: 1, corrections: 0 }))).toBe(
      "You rehearsed your interview with Alphonso (AI): 1 of 3 stages and 1 run. A new rehearsal, for a meeting, a landlord or a first day, needs Pro.",
    );
    expect(paywallSummary(done({ corrections: 1 }))).toContain("and 1 mistake sent to Fix");
  });

  it("with no history still says the first one was used, without inventing numbers", () => {
    expect(paywallSummary(null)).toBe(
      "You have used your free rehearsal with Alphonso (AI). A new rehearsal needs Pro.",
    );
  });

  it("never shows a score or a readiness number", () => {
    for (const kind of EVENT_KINDS)
      expect(paywallSummary(done({ eventKind: kind }))).not.toMatch(/score|ready|readiness|%|stars/i);
  });
});

describe("the debrief's headline", () => {
  it("says what the stage was in plain words", () => {
    expect(debriefTitle("conversation", "interview")).toBe("That was a full interview");
    expect(debriefTitle("warmup", "interview")).toBe("That was your warm-up");
    expect(debriefTitle("hard_moments", "meeting")).toBe("That was the hard moments");
  });
});
