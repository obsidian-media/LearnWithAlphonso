import { SECOND_FACTOR_REQUIRED_MESSAGE } from "./admin-auth";

/**
 * What a console page does with a failed server call. A staff member who lacks a scope is told so on the page (sending
 * them to the sign-in form would be wrong); a missing second factor goes to enrolment; anything else is a sign-in.
 */
export type StaffErrorKind = "forbidden" | "mfa" | "signin";

export function classifyStaffError(error: unknown): StaffErrorKind {
  const message = error instanceof Error ? error.message : "";
  if (message.includes(SECOND_FACTOR_REQUIRED_MESSAGE)) return "mfa";
  if (message.startsWith("Forbidden: missing scope") || message.includes("Only an owner")) {
    return "forbidden";
  }
  return "signin";
}
