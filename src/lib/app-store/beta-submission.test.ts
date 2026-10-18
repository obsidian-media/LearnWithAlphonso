import { describe, expect, it } from "vitest";
import { betaSubmissionProblems, type BetaSubmissionFacts } from "./beta-submission";

const READY: BetaSubmissionFacts = {
  version: "51",
  processingState: "VALID",
  expired: false,
  externalBuildState: "READY_FOR_BETA_SUBMISSION",
  hasWhatToTest: true,
  hasBetaReviewContact: true,
};

describe("betaSubmissionProblems", () => {
  it("accepts a valid, unexpired build that is ready, with What to Test and review contact set", () => {
    expect(betaSubmissionProblems(READY)).toEqual([]);
  });
  it("refuses a build that is still processing or expired", () => {
    expect(betaSubmissionProblems({ ...READY, processingState: "PROCESSING" })[0]).toMatch(
      /not VALID/,
    );
    expect(betaSubmissionProblems({ ...READY, expired: true })[0]).toMatch(/expired/);
  });
  it("refuses to submit a build that is already in review, approved or rejected", () => {
    for (const state of [
      "IN_BETA_REVIEW",
      "BETA_APPROVED",
      "BETA_REJECTED",
      "WAITING_FOR_BETA_REVIEW",
      undefined,
    ]) {
      expect(betaSubmissionProblems({ ...READY, externalBuildState: state }).join(" ")).toMatch(
        /only READY_FOR_BETA_SUBMISSION/,
      );
    }
  });
  it("refuses without What to Test or the beta review contact", () => {
    expect(betaSubmissionProblems({ ...READY, hasWhatToTest: false })[0]).toMatch(/What to Test/);
    expect(betaSubmissionProblems({ ...READY, hasBetaReviewContact: false })[0]).toMatch(/contact/);
  });
  it("reports every problem at once", () => {
    expect(
      betaSubmissionProblems({ ...READY, processingState: "FAILED", hasWhatToTest: false }),
    ).toHaveLength(2);
  });
});
