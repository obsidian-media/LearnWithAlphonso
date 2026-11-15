import { describe, expect, it } from "vitest";
import { staffFirstName } from "./support-staff-name";

const EMAIL = "someone.else@example.com";
const first = (name: string | null | undefined, email: string | null | undefined = EMAIL) =>
  staffFirstName(name, email);

describe("the staff first name a learner may see", () => {
  it("is the first word of a plain display name", () => {
    expect(first("Dana Whitfield")).toBe("Dana");
    expect(first("  Amira   Hassan  ")).toBe("Amira");
    expect(first("Anne-Marie Roy")).toBe("Anne-Marie");
    expect(first("Zo\u00EB")).toBe("Zo\u00EB");
  });

  it("capitalises an all-lower-case name and leaves mixed case alone", () => {
    expect(first("jane Roy")).toBe("Jane");
    expect(first("McKay")).toBe("McKay");
  });

  it("never lets an email, a handle, digits or punctuation through", () => {
    for (const bad of [
      "jane.doe",
      "jane@example.com",
      "jane99",
      "j_doe",
      "@jane",
      "1234",
      "",
      "   ",
      null,
      undefined,
    ]) {
      expect(first(bad), String(bad)).toBeNull();
    }
  });

  it("is capped at 30 letters", () => {
    expect(first("A".repeat(31))).toBeNull();
    expect(first("A".repeat(30))).toBe("A".repeat(30));
  });

  it("keeps names with combining marks, decomposed or not (NFC first)", () => {
    expect(first("Jose\u0301 Garcia")).toBe("Jos\u00E9");
    expect(first("Jos\u00E9 Garcia")).toBe("Jos\u00E9");
    // Devanagari, Thai and Arabic with diacritics: letters plus combining marks.
    expect(first("\u0905\u092E\u093F\u0924 Kumar")).toBe("\u0905\u092E\u093F\u0924");
    expect(first("\u0E2A\u0E21\u0E0A\u0E32\u0E22 X")).toBe("\u0E2A\u0E21\u0E0A\u0E32\u0E22");
    expect(first("\u0645\u064F\u062D\u064E\u0645\u064E\u0651\u062F X")).toBe(
      "\u0645\u064F\u062D\u064E\u0645\u064E\u0651\u062F",
    );
  });
});

describe("a name that is the email's local part is the email leaking", () => {
  it("is dropped when it equals the local part, ignoring case, accents form and punctuation", () => {
    expect(first("thatisshayan", "thatisshayan@gmail.com")).toBeNull();
    expect(first("Thatisshayan", "thatisshayan@gmail.com")).toBeNull();
    expect(first("That Is Shayan", "that.is.shayan@gmail.com")).toBeNull();
    expect(first("Jose\u0301", "jos\u00E9@example.com")).toBeNull();
  });

  it("is kept when it differs from the local part", () => {
    expect(first("Dana Whitfield", "thatisshayan@gmail.com")).toBe("Dana");
    expect(first("Dana", "dana.whitfield@example.com")).toBe("Dana");
  });

  it("gives no name when the email is missing (the comparison cannot be made)", () => {
    expect(first("Dana Whitfield", null)).toBeNull();
    expect(staffFirstName("Dana Whitfield", undefined)).toBeNull();
    expect(first("Dana Whitfield", "")).toBeNull();
  });
});
