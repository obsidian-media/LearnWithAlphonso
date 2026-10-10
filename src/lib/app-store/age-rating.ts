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

/** Fields the 13+ rating depends on: absent from the live declaration is a problem, not something to skip. */
export const REQUIRED_AGE_RATING_FIELDS = ["userGeneratedContent", "messagingAndChat"] as const;

/**
 * The computed rating. Apple may report it on the declaration or only on the app info, so the declaration
 * is read first and the app info is the fallback; the source is returned so the output can say which.
 */
export function resolveComputedRating(
  live: Record<string, unknown>,
  appInfoRating?: string,
): { rating: string; source: "ageRatingDeclaration" | "appInfo" | "none" } {
  const fromDeclaration = live.appStoreAgeRating ?? live.ageRatingOverrideV2;
  if (fromDeclaration) return { rating: String(fromDeclaration), source: "ageRatingDeclaration" };
  if (appInfoRating) return { rating: appInfoRating, source: "appInfo" };
  return { rating: "", source: "none" };
}

export function ageRatingProblems(live: Record<string, unknown>, appInfoRating?: string): string[] {
  const p: string[] = [];
  for (const field of REQUIRED_AGE_RATING_FIELDS) {
    if (!(field in live))
      p.push(`${field}: missing from the live declaration (Apple may have renamed it)`);
  }
  for (const [k, v] of Object.entries(AGE_RATING_ANSWERS)) {
    if (k in live && live[k] !== v) p.push(`${k}: live ${String(live[k])}, expected ${String(v)}`);
  }
  const { rating } = resolveComputedRating(live, appInfoRating);
  if (!(rating in RANK)) p.push(`computed rating is unknown ("${rating}")`);
  else if (RANK[rating] < 13) p.push(`computed rating ${rating} is below 13+`);
  return p;
}

/**
 * App Store Connect no longer allows GET /v1/ageRatingDeclarations/{id} (403: only UPDATE is allowed).
 * The declaration is read through its parent: GET /v1/appInfos/{appInfoId}/ageRatingDeclaration.
 */
export function ageRatingDeclarationReadPath(appInfoId: string): string {
  return `/appInfos/${appInfoId}/ageRatingDeclaration`;
}

/** The declaration out of a relationship response, or a thrown error naming what was wrong. */
export function parseAgeRatingDeclaration(json: unknown): {
  id: string;
  attributes: Record<string, unknown>;
} {
  const data = (json as { data?: unknown } | null)?.data as
    { id?: unknown; type?: unknown; attributes?: unknown } | null | undefined;
  if (!data || typeof data !== "object")
    throw new Error("the app info has no age rating declaration in the response");
  if (data.type !== "ageRatingDeclarations")
    throw new Error(`expected an ageRatingDeclarations resource, got ${String(data.type)}`);
  if (typeof data.id !== "string" || data.id === "")
    throw new Error("the age rating declaration has no id");
  if (!data.attributes || typeof data.attributes !== "object")
    throw new Error("the age rating declaration has no attributes");
  return { id: data.id, attributes: data.attributes as Record<string, unknown> };
}
