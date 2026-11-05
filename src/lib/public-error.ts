/**
 * The error a learner-facing server function throws when a database call fails. The browser gets a stable code; the
 * database's own message (constraint, column, function and table names) goes only to the server log.
 *
 * A message that already IS a code the database raised on purpose (`blocked-content`, `rate-limited`,
 * `unauthenticated`: lower-case words joined by hyphens) passes through, because pages map those to their own copy
 * (for example profile-error.ts). Everything else becomes `request-failed`.
 */
function isRaisedCode(message: string): boolean {
  if (message === "unauthenticated") return true;
  if (message.length > 64) return false;
  const parts = message.split("-");
  return parts.length > 1 && parts.every((p) => /^[a-z]+$/.test(p));
}

export function publicError(
  context: string | null,
  error: { message?: string } | null | undefined,
): Error {
  const message = error?.message ?? "";
  console.error(`[${context ?? "server-function"}] ${message}`);
  const code = isRaisedCode(message) ? message : "request-failed";
  return new Error(context ? `${context}: ${code}` : code);
}
