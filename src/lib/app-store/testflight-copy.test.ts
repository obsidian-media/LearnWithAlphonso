import { describe, expect, it } from "vitest";
import { LISTING, PRIVACY } from "./listing-copy";
import { TESTFLIGHT, TESTFLIGHT_TEXT_LIMIT, testflightCopyProblems } from "./testflight-copy";

describe("testflight copy", () => {
  it("has no problems", () => {
    expect(testflightCopyProblems(TESTFLIGHT)).toEqual([]);
  });

  it("uses the same links as the listing", () => {
    expect(TESTFLIGHT.marketingUrl).toBe(LISTING.marketingUrl);
    expect(TESTFLIGHT.privacyPolicyUrl).toBe(PRIVACY);
  });

  it("tells testers the subscription cannot be bought yet", () => {
    expect(TESTFLIGHT.whatToTest).toMatch(/cannot be bought by testers yet/);
    // Hector is a Pro feature, so the note must not claim everything else works.
    expect(TESTFLIGHT.whatToTest).toMatch(/Hector[^.]*not available/);
    expect(TESTFLIGHT.whatToTest).not.toMatch(/everything else is free/i);
  });

  it("flags text over Apple's limit", () => {
    const long = { ...TESTFLIGHT, whatToTest: "x".repeat(TESTFLIGHT_TEXT_LIMIT + 1) };
    expect(testflightCopyProblems(long)).toEqual([
      `whatToTest: ${TESTFLIGHT_TEXT_LIMIT + 1} > ${TESTFLIGHT_TEXT_LIMIT}`,
    ]);
  });

  it("flags a bad email, a non-https link, a trial promise and a missing age", () => {
    const bad = {
      ...TESTFLIGHT,
      feedbackEmail: "support",
      privacyPolicyUrl: "http://example.com",
      whatToTest: "Start your free trial",
      betaDescription: "A language app.",
    };
    expect(testflightCopyProblems(bad)).toEqual([
      "feedbackEmail: not an email",
      "privacyPolicyUrl: not an https URL",
      "whatToTest: promises a free trial",
      "betaDescription: missing the 13+ age",
    ]);
  });

  it("flags empty text", () => {
    expect(testflightCopyProblems({ ...TESTFLIGHT, betaDescription: " " })).toContain(
      "betaDescription: empty",
    );
  });
});
