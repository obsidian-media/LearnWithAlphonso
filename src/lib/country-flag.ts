/**
 * The leaderboard flag. profiles.country is set ONLY while the learner has turned their flag on
 * (learner-profile.server.ts clears it otherwise), so a row's country being present is the consent signal:
 * the flag is drawn for those rows and never for anyone else. A malformed code draws nothing rather than a
 * wrong flag. iOS (ProfileMath.flagEmoji) and Android (ProfileMath.flagEmoji) follow the same rule.
 */
const REGIONAL_INDICATOR_OFFSET = 127397;

export function flagEmoji(country: string | null | undefined, showFlag = true): string | null {
  if (!showFlag || !country) return null;
  const code = country.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  return [...code]
    .map((c) => String.fromCodePoint(REGIONAL_INDICATOR_OFFSET + c.charCodeAt(0)))
    .join("");
}

/** What a screen reader says for the flag: the code stays available even though the flag is a picture. */
export function flagLabel(country: string | null | undefined): string | null {
  if (!country || !/^[A-Za-z]{2}$/.test(country)) return null;
  return `Country ${country.toUpperCase()}`;
}
