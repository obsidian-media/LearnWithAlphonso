/**
 * Age-rating answers for v1.0: AI tutor chat, preset messages between matched strangers, public
 * display names and leaderboards, rated 13+. Only fields this app has evidence for are listed.
 * Field names were read live from the app's declaration; ageRatingPatch() and ageRatingProblems()
 * ignore any field the live declaration lacks, so a renamed Apple field shows up in "check"
 * instead of being PATCHed blindly.
 */
export const AGE_RATING_ANSWERS = {
  userGeneratedContent: true, // display names, team names, reports, AI conversation input
  messagingAndChat: true, // AI tutor and practice chat; study-buddy preset messages between matched strangers
  socialMedia: true, // public names, leaderboards, friends, teams, stranger matching
  contests: "INFREQUENT_OR_MILD", // leagues, duels
  gamblingSimulated: "NONE",
  gambling: false,
  unrestrictedWebAccess: false,
} as const;

const RANK: Record<string, number> = {
  FOUR_PLUS: 4,
  NINE_PLUS: 9,
  TWELVE_PLUS: 12,
  THIRTEEN_PLUS: 13,
  SIXTEEN_PLUS: 16,
  SEVENTEEN_PLUS: 17,
  EIGHTEEN_PLUS: 18,
};

/** The subset of the answers to PATCH: only fields the live declaration actually has. */
export function ageRatingPatch(live: Record<string, unknown>): Record<string, string | boolean> {
  const patch: Record<string, string | boolean> = {};
  for (const [k, v] of Object.entries(AGE_RATING_ANSWERS)) if (k in live) patch[k] = v;
  return patch;
}

export function ageRatingProblems(live: Record<string, unknown>): string[] {
  const p: string[] = [];
  for (const [k, v] of Object.entries(AGE_RATING_ANSWERS)) {
    if (k in live && live[k] !== v) p.push(`${k}: live ${String(live[k])}, expected ${String(v)}`);
  }
  const rating = String(live.appStoreAgeRating ?? live.ageRatingOverrideV2 ?? "");
  if (!(rating in RANK)) p.push(`computed rating is unknown ("${rating}")`);
  else if (RANK[rating] < 13) p.push(`computed rating ${rating} is below 13+`);
  return p;
}
