import { describe, expect, it } from "vitest";
import { LISTING, LISTING_LIMITS, listingProblems } from "./listing-copy";

describe("LISTING", () => {
  it("has no problems", () => {
    expect(listingProblems(LISTING)).toEqual([]);
  });

  it("respects Apple's length limits", () => {
    expect(LISTING.subtitle.length).toBeLessThanOrEqual(30);
    expect(LISTING.promotionalText.length).toBeLessThanOrEqual(170);
    expect(LISTING.keywords.length).toBeLessThanOrEqual(100);
    expect(LISTING.description.length).toBeLessThanOrEqual(4000);
    expect(LISTING_LIMITS).toEqual({
      subtitle: 30,
      promotionalText: 170,
      keywords: 100,
      description: 4000,
    });
  });

  it("names all three courses in the subtitle", () => {
    for (const c of ["English", "French", "Spanish"]) expect(LISTING.subtitle).toContain(c);
  });

  it("points the marketing URL at the marketing site and support at the support page", () => {
    expect(LISTING.marketingUrl).toBe("https://discover.alphonsoecosystem.app");
    expect(LISTING.supportUrl).toBe("https://learn.alphonsoecosystem.app/support");
  });

  it("states no price", () => {
    expect(JSON.stringify(LISTING)).not.toMatch(/[$€£]\s?\d|\d\s?(USD|EUR)/);
  });

  // Each check below removes exactly the property its rule guards.
  it("flags a description without the Standard EULA link", () => {
    const d = LISTING.description.replace(
      "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/",
      "",
    );
    expect(listingProblems({ ...LISTING, description: d })).toContain(
      "description: missing Apple Standard EULA URL",
    );
  });

  it("flags a description without the Terms or Privacy link", () => {
    expect(
      listingProblems({
        ...LISTING,
        description: LISTING.description.replace("https://learn.alphonsoecosystem.app/terms", ""),
      }),
    ).toContain("description: missing Terms of Use URL");
    expect(
      listingProblems({
        ...LISTING,
        description: LISTING.description.replace("https://learn.alphonsoecosystem.app/privacy", ""),
      }),
    ).toContain("description: missing Privacy Policy URL");
  });

  it("flags a description without the auto-renewal disclosure", () => {
    const d = LISTING.description.replace(
      "at least 24 hours before the end of the current period",
      "",
    );
    expect(listingProblems({ ...LISTING, description: d })).toContain(
      "description: missing auto-renewal disclosure",
    );
  });

  it("flags forbidden copy", () => {
    for (const bad of [
      "coming soon",
      "--",
      "$9.99",
      "Duolingo",
      "best app",
      "Android",
      "Google Play",
    ]) {
      expect(listingProblems({ ...LISTING, promotionalText: `x ${bad}` }).join("|"), bad).toMatch(
        /forbidden/,
      );
    }
  });

  it("flags the old league tier names, which the app no longer shows", () => {
    for (const bad of ["Bronze", "Silver", "Diamond"]) {
      expect(
        listingProblems({ ...LISTING, promotionalText: `Climb to ${bad}` }).join("|"),
        bad,
      ).toMatch(/forbidden/);
    }
  });

  it("flags an over-long field", () => {
    expect(listingProblems({ ...LISTING, subtitle: "x".repeat(31) }).join("|")).toMatch(/subtitle/);
    expect(listingProblems({ ...LISTING, keywords: "k".repeat(101) }).join("|")).toMatch(
      /keywords/,
    );
  });

  it("flags keyword spaces, duplicates and words already in the name or subtitle", () => {
    expect(listingProblems({ ...LISTING, keywords: "speaking, grammar" }).join("|")).toMatch(
      /space/,
    );
    expect(listingProblems({ ...LISTING, keywords: "grammar,grammar" }).join("|")).toMatch(
      /duplicate/,
    );
    expect(listingProblems({ ...LISTING, keywords: "spanish,grammar" }).join("|")).toMatch(
      /already in name or subtitle/,
    );
  });
});
