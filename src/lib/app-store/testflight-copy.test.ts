import { describe, expect, it } from "vitest";
import { LISTING } from "./listing-copy";
import { TESTFLIGHT, TESTFLIGHT_TEXT_LIMIT, testflightCopyProblems } from "./testflight-copy";

describe("testflight copy", () => {
  it("has no problems", () => {
    expect(testflightCopyProblems(TESTFLIGHT)).toEqual([]);
  });

  it("uses the same marketing link as the listing", () => {
    expect(TESTFLIGHT.marketingUrl).toBe(LISTING.marketingUrl);
  });

  it("tells testers the subscription cannot be bought yet", () => {
    expect(TESTFLIGHT.whatToTest).toMatch(/not open to testers yet/);
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
