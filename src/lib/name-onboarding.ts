import fixtures from "./name-onboarding.fixtures.json";

/**
 * The public-name prompt's rules and words, the same as the iOS Kit's DisplayNameOnboarding. Both read
 * name-onboarding.fixtures.json; name-onboarding-native-fixtures.test.ts keeps the copies identical.
 */
export const NAME_ONBOARDING_COPY = fixtures.copy;
export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 40;

export type AuthUserNames = {
  givenName: string | null;
  fullName: string | null;
  name: string | null;
};

export function normalizeName(raw: string): string {
  return raw.split(/\s+/u).filter(Boolean).join(" ");
}

/** The server's 2 to 40 rule, counted in code points like Postgres char_length and the Kit's unicodeScalars. */
export function localNameProblem(raw: string): "invalid-name" | null {
  const length = [...normalizeName(raw)].length;
  return length < NAME_MIN_LENGTH || length > NAME_MAX_LENGTH ? "invalid-name" : null;
}

export function isLearnerHandle(name: string): boolean {
  return /^Learner-[0-9A-F]{4}$/.test(name);
}

export function needsNamePrompt(nameConfirmedAt: string | null | undefined): boolean {
  return nameConfirmedAt == null;
}

export function pickUserNames(meta: Record<string, unknown> | undefined): AuthUserNames {
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    givenName: str(meta?.given_name),
    fullName: str(meta?.full_name),
    name: str(meta?.name),
  };
}

function firstWord(text: string | null | undefined): string | null {
  if (!text) return null;
  return normalizeName(text).split(" ")[0] || null;
}

/** Apple's saved given name, else given_name, else the first word of full_name or name, else the stored name. */
export function namePrefill(opts: {
  appleGivenName?: string | null;
  names?: AuthUserNames | null;
  currentName: string;
}): string {
  const candidates = [
    opts.appleGivenName ?? null,
    opts.names?.givenName ?? null,
    firstWord(opts.names?.fullName),
    firstWord(opts.names?.name),
  ];
  for (const candidate of candidates) {
    if (candidate == null) continue;
    const clean = normalizeName(candidate);
    if (clean && !clean.includes("@") && localNameProblem(clean) === null) return clean;
  }
  return opts.currentName;
}

export function skipNote(currentName: string): string {
  return isLearnerHandle(currentName)
    ? NAME_ONBOARDING_COPY.skipNoteHandle.replace("{name}", currentName)
    : NAME_ONBOARDING_COPY.skipNoteGeneric;
}
