import { describe, expect, it } from "vitest";
import { flagEmoji, flagLabel } from "./country-flag";

describe("flagEmoji", () => {
  it("turns a two-letter code into its flag, in any case", () => {
    expect(flagEmoji("CA")).toBe("🇨🇦");
    expect(flagEmoji("nl")).toBe("🇳🇱");
    expect(flagEmoji("ES")).toBe("🇪🇸");
  });
  it("draws nothing without a country (the learner did not consent)", () => {
    expect(flagEmoji(null)).toBeNull();
    expect(flagEmoji(undefined)).toBeNull();
    expect(flagEmoji("")).toBeNull();
  });
  it("draws nothing when the flag is switched off, even with a country", () => {
    expect(flagEmoji("CA", false)).toBeNull();
  });
  it("draws nothing for a malformed code rather than a wrong flag", () => {
    expect(flagEmoji("C")).toBeNull();
    expect(flagEmoji("CAN")).toBeNull();
    expect(flagEmoji("C1")).toBeNull();
    expect(flagEmoji("é!")).toBeNull();
  });
});

describe("flagLabel", () => {
  it("keeps the country code for screen readers", () => {
    expect(flagLabel("ca")).toBe("Country CA");
  });
  it("is empty without a valid code", () => {
    expect(flagLabel(null)).toBeNull();
    expect(flagLabel("CAN")).toBeNull();
  });
});
