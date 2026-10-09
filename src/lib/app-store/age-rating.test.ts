import { describe, expect, it } from "vitest";
import { AGE_RATING_ANSWERS, ageRatingPatch, ageRatingProblems } from "./age-rating";

describe("age rating (13+, AI chat and stranger matching declared)", () => {
  it("declares messaging/chat and user-generated content (AI conversation, preset messages, names)", () => {
    expect(AGE_RATING_ANSWERS.messagingAndChat).toBe(true);
    expect(AGE_RATING_ANSWERS.userGeneratedContent).toBe(true);
  });

  it("accepts a live declaration that matches and rates 13+", () => {
    expect(ageRatingProblems({ ...AGE_RATING_ANSWERS, appStoreAgeRating: "THIRTEEN_PLUS" })).toEqual([]);
  });

  it("accepts a stricter computed rating", () => {
    expect(ageRatingProblems({ ...AGE_RATING_ANSWERS, appStoreAgeRating: "SIXTEEN_PLUS" })).toEqual([]);
  });

  it("flags a live declaration below 13+ or with chat undeclared", () => {
    expect(ageRatingProblems({ ...AGE_RATING_ANSWERS, appStoreAgeRating: "FOUR_PLUS" }).join("|")).toMatch(/13\+/);
    expect(
      ageRatingProblems({ ...AGE_RATING_ANSWERS, messagingAndChat: false, appStoreAgeRating: "THIRTEEN_PLUS" }).join("|"),
    ).toMatch(/messagingAndChat/);
  });

  it("flags a missing computed rating rather than assuming it is fine", () => {
    expect(ageRatingProblems({ ...AGE_RATING_ANSWERS }).join("|")).toMatch(/unknown/);
  });

  it("ignores a field the live declaration does not have", () => {
    const { socialMedia: _omit, ...live } = AGE_RATING_ANSWERS;
    expect(ageRatingProblems({ ...live, appStoreAgeRating: "THIRTEEN_PLUS" })).toEqual([]);
  });
});

describe("ageRatingPatch", () => {
  it("patches only the fields the live declaration has", () => {
    const patch = ageRatingPatch({ userGeneratedContent: false, messagingAndChat: false, somethingNew: 1 });
    expect(patch).toEqual({ userGeneratedContent: true, messagingAndChat: true });
  });

  it("never patches the computed rating or an override", () => {
    const patch = ageRatingPatch({ appStoreAgeRating: "FOUR_PLUS", ageRatingOverrideV2: "NONE", messagingAndChat: false });
    expect(Object.keys(patch)).toEqual(["messagingAndChat"]);
  });
});
