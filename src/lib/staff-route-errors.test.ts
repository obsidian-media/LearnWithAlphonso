import { describe, expect, it } from "vitest";
import { SECOND_FACTOR_REQUIRED_MESSAGE, UNAUTHORIZED_MESSAGE } from "./admin-auth";
import { classifyStaffError } from "./staff-route-errors";

describe("classifyStaffError", () => {
  it("a missing scope is forbidden, not a sign-in", () => {
    expect(classifyStaffError(new Error("Forbidden: missing scope audit.read"))).toBe("forbidden");
    expect(classifyStaffError(new Error("Only an owner can manage staff."))).toBe("forbidden");
  });
  it("a missing second factor goes to enrolment", () => {
    expect(classifyStaffError(new Error(SECOND_FACTOR_REQUIRED_MESSAGE))).toBe("mfa");
  });
  it("not staff, a bad token and anything unknown go to sign-in", () => {
    expect(classifyStaffError(new Error(UNAUTHORIZED_MESSAGE))).toBe("signin");
    expect(classifyStaffError(new Error("boom"))).toBe("signin");
    expect(classifyStaffError("nope")).toBe("signin");
  });
});
