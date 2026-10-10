import { describe, expect, it } from "vitest";
import {
  AGE_RATING_ANSWERS,
  REQUIRED_AGE_RATING_FIELDS,
  ageRatingPatch,
  ageRatingProblems,
  resolveComputedRating,
  ageRatingDeclarationReadPath,
  parseAgeRatingDeclaration,
} from "./age-rating";

describe("age rating (13+, AI chat and stranger matching declared)", () => {
  it("declares messaging/chat and user-generated content (AI conversation, preset messages, names)", () => {
    expect(AGE_RATING_ANSWERS.messagingAndChat).toBe(true);
    expect(AGE_RATING_ANSWERS.userGeneratedContent).toBe(true);
  });

  it("accepts a live declaration that matches and rates 13+", () => {
    expect(
      ageRatingProblems({ ...AGE_RATING_ANSWERS, appStoreAgeRating: "THIRTEEN_PLUS" }),
    ).toEqual([]);
  });

  it("accepts a stricter computed rating", () => {
    expect(ageRatingProblems({ ...AGE_RATING_ANSWERS, appStoreAgeRating: "SIXTEEN_PLUS" })).toEqual(
      [],
    );
  });

  it("flags a live declaration below 13+ or with chat undeclared", () => {
    expect(
      ageRatingProblems({ ...AGE_RATING_ANSWERS, appStoreAgeRating: "FOUR_PLUS" }).join("|"),
    ).toMatch(/13\+/);
    expect(
      ageRatingProblems({
        ...AGE_RATING_ANSWERS,
        messagingAndChat: false,
        appStoreAgeRating: "THIRTEEN_PLUS",
      }).join("|"),
    ).toMatch(/messagingAndChat/);
  });

  it("flags a missing computed rating rather than assuming it is fine", () => {
    expect(ageRatingProblems({ ...AGE_RATING_ANSWERS }).join("|")).toMatch(/unknown/);
  });

  it("ignores an optional field the live declaration does not have", () => {
    const { socialMedia: _omit, ...live } = AGE_RATING_ANSWERS;
    expect(ageRatingProblems({ ...live, appStoreAgeRating: "THIRTEEN_PLUS" })).toEqual([]);
  });

  it("treats the user-generated-content and messaging fields as required", () => {
    expect([...REQUIRED_AGE_RATING_FIELDS].sort()).toEqual([
      "messagingAndChat",
      "userGeneratedContent",
    ]);
    for (const field of REQUIRED_AGE_RATING_FIELDS) {
      const live: Record<string, unknown> = {
        ...AGE_RATING_ANSWERS,
        appStoreAgeRating: "THIRTEEN_PLUS",
      };
      delete live[field];
      expect(ageRatingProblems(live).join("|"), field).toMatch(new RegExp(`${field}: missing`));
    }
  });

  it("takes the computed rating from the app info when the declaration lacks it", () => {
    expect(ageRatingProblems({ ...AGE_RATING_ANSWERS }, "THIRTEEN_PLUS")).toEqual([]);
    expect(ageRatingProblems({ ...AGE_RATING_ANSWERS }, "FOUR_PLUS").join("|")).toMatch(/13\+/);
  });
});

describe("resolveComputedRating", () => {
  it("prefers the declaration, then the app info, and says which it used", () => {
    expect(resolveComputedRating({ appStoreAgeRating: "THIRTEEN_PLUS" }, "SIXTEEN_PLUS")).toEqual({
      rating: "THIRTEEN_PLUS",
      source: "ageRatingDeclaration",
    });
    expect(resolveComputedRating({}, "SIXTEEN_PLUS")).toEqual({
      rating: "SIXTEEN_PLUS",
      source: "appInfo",
    });
    expect(resolveComputedRating({}, undefined)).toEqual({ rating: "", source: "none" });
  });

  it("treats an override of NONE as no override and falls back to the app info rating", () => {
    expect(resolveComputedRating({ ageRatingOverrideV2: "NONE" }, "THIRTEEN_PLUS")).toEqual({
      rating: "THIRTEEN_PLUS",
      source: "appInfo",
    });
    expect(resolveComputedRating({ ageRatingOverrideV2: "NONE" }, undefined)).toEqual({ rating: "", source: "none" });
    expect(resolveComputedRating({ ageRatingOverrideV2: "SIXTEEN_PLUS" }, "THIRTEEN_PLUS")).toEqual({
      rating: "SIXTEEN_PLUS",
      source: "ageRatingDeclaration",
    });
  });
});

describe("ageRatingPatch", () => {
  it("patches only the fields the live declaration has", () => {
    const patch = ageRatingPatch({
      userGeneratedContent: false,
      messagingAndChat: false,
      somethingNew: 1,
    });
    expect(patch).toEqual({ userGeneratedContent: true, messagingAndChat: true });
  });

  it("never patches the computed rating or an override", () => {
    const patch = ageRatingPatch({
      appStoreAgeRating: "FOUR_PLUS",
      ageRatingOverrideV2: "NONE",
      messagingAndChat: false,
    });
    expect(Object.keys(patch)).toEqual(["messagingAndChat"]);
  });
});

describe("reading the declaration through its app info", () => {
  it("uses the relationship path, never GET on the declaration itself", () => {
    const path = ageRatingDeclarationReadPath("info-1");
    expect(path).toBe("/appInfos/info-1/ageRatingDeclaration");
    expect(path).not.toMatch(/^\/ageRatingDeclarations/);
  });

  const response = {
    data: {
      type: "ageRatingDeclarations",
      id: "decl-1",
      attributes: { userGeneratedContent: true, messagingAndChat: true, violenceRealistic: "NONE" },
      links: { self: "https://api.appstoreconnect.apple.com/v1/ageRatingDeclarations/decl-1" },
    },
    links: {
      self: "https://api.appstoreconnect.apple.com/v1/appInfos/info-1/ageRatingDeclaration",
    },
  };

  it("parses id and attributes out of the relationship response", () => {
    const parsed = parseAgeRatingDeclaration(response);
    expect(parsed.id).toBe("decl-1");
    expect(parsed.attributes.userGeneratedContent).toBe(true);
    expect(parsed.attributes.messagingAndChat).toBe(true);
  });

  it("rejects an empty, wrong-typed or id-less response", () => {
    expect(() => parseAgeRatingDeclaration({ data: null })).toThrow(/no age rating declaration/);
    expect(() => parseAgeRatingDeclaration(null)).toThrow(/no age rating declaration/);
    expect(() =>
      parseAgeRatingDeclaration({ data: { type: "appInfos", id: "x", attributes: {} } }),
    ).toThrow(/expected an ageRatingDeclarations/);
    expect(() =>
      parseAgeRatingDeclaration({ data: { type: "ageRatingDeclarations", attributes: {} } }),
    ).toThrow(/no id/);
  });

  it("feeds the check: required fields still flagged when missing from the parsed attributes", () => {
    const parsed = parseAgeRatingDeclaration({
      data: {
        type: "ageRatingDeclarations",
        id: "d",
        attributes: { appStoreAgeRating: "FOUR_PLUS" },
      },
    });
    const problems = ageRatingProblems(parsed.attributes);
    expect(problems.some((p) => p.startsWith("userGeneratedContent: missing"))).toBe(true);
    expect(problems.some((p) => p.startsWith("messagingAndChat: missing"))).toBe(true);
  });
});
