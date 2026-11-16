import { redirect } from "@tanstack/react-router";
import { classifyStaffError } from "./staff-route-errors";
import type { Scope } from "./staff-scopes";

/** The second line of the forbidden card: names the access the page needs. The support page's line is the original. */
export const FORBIDDEN_ACCESS: Partial<Record<Scope, string>> = {
  "support.read": "the Support role",
  "users.read": "Users access",
  "staff.manage": "Staff access",
  "audit.read": "Action record access",
  "reports.manage": "Reports access",
  "podcasts.manage": "Podcasts access",
  "numbers.read": "Numbers access",
};

export function forbiddenLine(scope: Scope): string {
  return `Ask the owner to add ${FORBIDDEN_ACCESS[scope] ?? "access"} to your account.`;
}

/**
 * What a loader does with a failed server call: a signed-in person who lacks the scope is told so on the page (a
 * forbidden result), anyone else is sent to sign in. The server decides; this only chooses what to show.
 */
export function forbiddenOrSignIn(error: unknown, scope: Scope): { forbidden: true; scope: Scope } {
  if (classifyStaffError(error) === "forbidden") return { forbidden: true, scope };
  throw redirect({ href: "/signin" });
}
