/**
 * The only part of a staff member's name a learner ever sees: a first name, from the profile's display name.
 * Never an email address, a surname, an id or anything with digits or punctuation (a display name that is really an
 * email's local part, like "jane.doe99", gives no name, and the reply is labelled "Support team" only).
 *
 * A new profile's display name defaults to the local part of the account's email, so a name that equals that local part
 * (ignoring case, accents and punctuation) is the email leaking and gives no name either. The email is read on the
 * server for this comparison only and is never sent anywhere; without it the check cannot be made, so no name shows.
 * Safe for the browser and the server.
 */
const FIRST_NAME = /^\p{L}[\p{L}\p{M}'\u2019-]{0,29}$/u;

/** Letters and digits only, NFC, lower case: "That.Is-Shayan" and "thatisshayan" compare equal. */
const squash = (s: string): string =>
  s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]/gu, "");

export function staffFirstName(
  displayName: string | null | undefined,
  email: string | null | undefined,
): string | null {
  if (!email) return null;
  const name = (displayName ?? "").normalize("NFC").trim();
  const local = email.slice(0, email.lastIndexOf("@") >= 0 ? email.lastIndexOf("@") : undefined);
  if (squash(name) === squash(local)) return null;
  const first = name.split(/\s+/u)[0] ?? "";
  if (!FIRST_NAME.test(first)) return null;
  // "jane" (typed lower case) reads as "Jane"; "McKay" and "Anne-Marie" are left alone.
  return first === first.toLowerCase() ? first.charAt(0).toUpperCase() + first.slice(1) : first;
}
