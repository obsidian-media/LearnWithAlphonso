import { describe, expect, it } from "vitest";
import { staffFirstName } from "./support-staff-name";

describe("the staff first name a learner may see", () => {
  it("is the first word of a plain display name", () => {
    expect(staffFirstName("Dana Whitfield")).toBe("Dana");
    expect(staffFirstName("  Amira   Hassan  ")).toBe("Amira");
    expect(staffFirstName("Anne-Marie Roy")).toBe("Anne-Marie");
    expect(staffFirstName("Zo\u00EB")).toBe("Zo\u00EB");
  });

  it("capitalises an all-lower-case name and leaves mixed case alone", () => {
    expect(staffFirstName("jane")).toBe("Jane");
    expect(staffFirstName("McKay")).toBe("McKay");
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
      expect(staffFirstName(bad), String(bad)).toBeNull();
    }
  });

  it("is capped at 30 letters", () => {
    expect(staffFirstName("A".repeat(31))).toBeNull();
    expect(staffFirstName("A".repeat(30))).toBe("A".repeat(30));
  });
});
