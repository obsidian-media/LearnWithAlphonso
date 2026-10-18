/**
 * Can this build go to external Beta App Review? Pure so it is tested; scripts/asc-release-ops.ts
 * `submit-beta-review` reads the facts from App Store Connect and refuses on any problem.
 */
export type BetaSubmissionFacts = {
  version: string;
  processingState: string | undefined;
  expired: boolean | undefined;
  /** buildBetaDetail.externalBuildState, e.g. READY_FOR_BETA_SUBMISSION, IN_BETA_REVIEW, BETA_APPROVED. */
  externalBuildState: string | undefined;
  hasWhatToTest: boolean;
  hasBetaReviewContact: boolean;
};

export function betaSubmissionProblems(f: BetaSubmissionFacts): string[] {
  const p: string[] = [];
  if (f.processingState !== "VALID")
    p.push(`build ${f.version} is ${String(f.processingState)}, not VALID`);
  if (f.expired) p.push(`build ${f.version} is expired`);
  if (f.externalBuildState !== "READY_FOR_BETA_SUBMISSION") {
    p.push(
      `external state is ${String(f.externalBuildState)}; only READY_FOR_BETA_SUBMISSION can be submitted (a build already in review or approved must not be submitted again)`,
    );
  }
  if (!f.hasWhatToTest)
    p.push("What to Test is empty for this build (run testflight --apply first)");
  if (!f.hasBetaReviewContact)
    p.push("Beta App Review contact details are not set (run beta-review-info --apply first)");
  return p;
}
