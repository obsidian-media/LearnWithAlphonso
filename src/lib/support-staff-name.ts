/**
 * The only part of a staff member's name a learner ever sees: a first name, from the profile's display name.
 * Never an email address, a surname, an id or anything with digits or punctuation (a display name that is really an
 * email's local part, like "jane.doe99", gives no name, and the reply is labelled "Support team" only).
 * Safe for the browser and the server; the Swift and Kotlin twins hold the same rule (the parity test reads them).
 */
const FIRST_NAME = /^\p{L}[\p{L}'’-]{0,29}$/u;

export function staffFirstName(displayName: string | null | undefined): string | null {
  const first = (displayName ?? "").trim().split(/\s+/u)[0] ?? "";
  if (!FIRST_NAME.test(first)) return null;
  // "jane" (typed lower case, or an email's local part) reads as "Jane"; "McKay" and "Anne-Marie" are left alone.
  return first === first.toLowerCase() ? first.charAt(0).toUpperCase() + first.slice(1) : first;
}
