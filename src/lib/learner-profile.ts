import { z } from "zod";
import { EXPLAIN_MODES } from "./explain";

/**
 * The learner's first-run answers (visual round 6, BACKLOG 0.0-bd), kept on the account in Supabase auth
 * `user_metadata.learner_profile`, like the voice choice (#433). No new table: nothing here is shown to other
 * learners, and the account record already goes away with the account. The two public bits live where other
 * learners already read them: the avatar in profiles.avatar_seed (profile-avatars.ts) and, only when the learner
 * turns the flag on, the country in profiles.country.
 *
 * Writes go through the server (learner-profile.functions.ts), which checks every value against these lists. The
 * metadata is still writable by the account itself, so every reader parses with parseLearnerProfile too.
 *
 * Privacy rules: an age RANGE only, never a birth date; no range for under 13 exists here at all (the age screen's
 * block stays on the device, see first-run.ts).
 */
export const LEARNER_PROFILE_KEY = "learner_profile";

export const AGE_RANGES = ["13-17", "18-24", "25-34", "35-54", "55+"] as const;
export const GOALS = ["travel", "work", "school", "family", "exam", "fun"] as const;
export const LEVELS = ["new", "some", "confident"] as const;
export const DAILY_MINUTES = [5, 10, 15, 20] as const;
export const INTERESTS = [
  "food",
  "travel",
  "sport",
  "music",
  "movies",
  "business",
  "tech",
  "nature",
  "art",
  "family",
] as const;
export const HEARD_FROM = [
  "app_store",
  "search",
  "youtube",
  "social",
  "friend",
  "podcast",
] as const;
export const PROFILE_COURSES = ["en", "fr", "es"] as const;
/** Learning-path types a learner may switch off (lessons are the backbone and can never be switched off). */
export const PATH_OPTIONAL_TYPES = ["podcast", "talk", "campaign"] as const;
export type PathOptionalType = (typeof PATH_OPTIONAL_TYPES)[number];

/** ISO 639-1 codes for the "I speak" picker; names come from Intl.DisplayNames. */
export const NATIVE_LANGUAGES = [
  "en",
  "es",
  "fr",
  "pt",
  "de",
  "it",
  "nl",
  "ar",
  "fa",
  "tr",
  "ru",
  "uk",
  "pl",
  "ro",
  "el",
  "he",
  "hi",
  "bn",
  "ur",
  "pa",
  "ta",
  "te",
  "mr",
  "gu",
  "zh",
  "ja",
  "ko",
  "vi",
  "th",
  "id",
  "ms",
  "tl",
  "sw",
  "am",
  "yo",
  "ha",
  "ig",
  "zu",
  "sv",
  "no",
  "da",
  "fi",
  "cs",
  "sk",
  "hu",
  "bg",
  "sr",
  "hr",
  "ca",
  "eu",
  "gl",
  "ku",
  "ps",
  "ne",
  "si",
  "km",
  "my",
  "so",
] as const;

/** ISO 3166-1 alpha-2, the same two letters profiles.country requires (profiles_country_iso2). */
export const COUNTRIES = [
  "AD",
  "AE",
  "AF",
  "AG",
  "AI",
  "AL",
  "AM",
  "AO",
  "AQ",
  "AR",
  "AS",
  "AT",
  "AU",
  "AW",
  "AX",
  "AZ",
  "BA",
  "BB",
  "BD",
  "BE",
  "BF",
  "BG",
  "BH",
  "BI",
  "BJ",
  "BL",
  "BM",
  "BN",
  "BO",
  "BQ",
  "BR",
  "BS",
  "BT",
  "BV",
  "BW",
  "BY",
  "BZ",
  "CA",
  "CC",
  "CD",
  "CF",
  "CG",
  "CH",
  "CI",
  "CK",
  "CL",
  "CM",
  "CN",
  "CO",
  "CR",
  "CU",
  "CV",
  "CW",
  "CX",
  "CY",
  "CZ",
  "DE",
  "DJ",
  "DK",
  "DM",
  "DO",
  "DZ",
  "EC",
  "EE",
  "EG",
  "EH",
  "ER",
  "ES",
  "ET",
  "FI",
  "FJ",
  "FK",
  "FM",
  "FO",
  "FR",
  "GA",
  "GB",
  "GD",
  "GE",
  "GF",
  "GG",
  "GH",
  "GI",
  "GL",
  "GM",
  "GN",
  "GP",
  "GQ",
  "GR",
  "GS",
  "GT",
  "GU",
  "GW",
  "GY",
  "HK",
  "HM",
  "HN",
  "HR",
  "HT",
  "HU",
  "ID",
  "IE",
  "IL",
  "IM",
  "IN",
  "IO",
  "IQ",
  "IR",
  "IS",
  "IT",
  "JE",
  "JM",
  "JO",
  "JP",
  "KE",
  "KG",
  "KH",
  "KI",
  "KM",
  "KN",
  "KP",
  "KR",
  "KW",
  "KY",
  "KZ",
  "LA",
  "LB",
  "LC",
  "LI",
  "LK",
  "LR",
  "LS",
  "LT",
  "LU",
  "LV",
  "LY",
  "MA",
  "MC",
  "MD",
  "ME",
  "MF",
  "MG",
  "MH",
  "MK",
  "ML",
  "MM",
  "MN",
  "MO",
  "MP",
  "MQ",
  "MR",
  "MS",
  "MT",
  "MU",
  "MV",
  "MW",
  "MX",
  "MY",
  "MZ",
  "NA",
  "NC",
  "NE",
  "NF",
  "NG",
  "NI",
  "NL",
  "NO",
  "NP",
  "NR",
  "NU",
  "NZ",
  "OM",
  "PA",
  "PE",
  "PF",
  "PG",
  "PH",
  "PK",
  "PL",
  "PM",
  "PN",
  "PR",
  "PS",
  "PT",
  "PW",
  "PY",
  "QA",
  "RE",
  "RO",
  "RS",
  "RU",
  "RW",
  "SA",
  "SB",
  "SC",
  "SD",
  "SE",
  "SG",
  "SH",
  "SI",
  "SJ",
  "SK",
  "SL",
  "SM",
  "SN",
  "SO",
  "SR",
  "SS",
  "ST",
  "SV",
  "SX",
  "SY",
  "SZ",
  "TC",
  "TD",
  "TF",
  "TG",
  "TH",
  "TJ",
  "TK",
  "TL",
  "TM",
  "TN",
  "TO",
  "TR",
  "TT",
  "TV",
  "TW",
  "TZ",
  "UA",
  "UG",
  "UM",
  "US",
  "UY",
  "UZ",
  "VA",
  "VC",
  "VE",
  "VG",
  "VI",
  "VN",
  "VU",
  "WF",
  "WS",
  "XK",
  "YE",
  "YT",
  "ZA",
  "ZM",
  "ZW",
] as const;

export type AgeRange = (typeof AGE_RANGES)[number];
export type Goal = (typeof GOALS)[number];
export type SelfLevel = (typeof LEVELS)[number];
export type DailyMinutes = (typeof DAILY_MINUTES)[number];
export type Interest = (typeof INTERESTS)[number];
export type HeardFrom = (typeof HEARD_FROM)[number];
export type ProfileCourse = (typeof PROFILE_COURSES)[number];

const nameSchema = z.string().trim().min(1).max(40);
const isoDate = z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
const isoTime = z
  .string()
  .max(40)
  .refine((s) => !Number.isNaN(Date.parse(s)));

/** Every field the client may send. Strict: an unknown key (a birth date, say) fails the whole save. */
export const learnerProfilePatchSchema = z
  .object({
    name: nameSchema.optional(),
    course: z.enum(PROFILE_COURSES).optional(),
    nativeLanguage: z.enum(NATIVE_LANGUAGES).optional(),
    explainMode: z.enum(EXPLAIN_MODES).optional(),
    country: z.enum(COUNTRIES).optional(),
    showFlag: z.boolean().optional(),
    goal: z.enum(GOALS).optional(),
    level: z.enum(LEVELS).optional(),
    dailyMinutes: z
      .union(
        DAILY_MINUTES.map((m) => z.literal(m)) as [
          z.ZodLiteral<5>,
          z.ZodLiteral<10>,
          z.ZodLiteral<15>,
          z.ZodLiteral<20>,
        ],
      )
      .optional(),
    ageRange: z.enum(AGE_RANGES).optional(),
    interests: z.array(z.enum(INTERESTS)).max(INTERESTS.length).optional(),
    heardFrom: z.enum(HEARD_FROM).optional(),
    /** Learning path: the optional types switched off, and the day "lessons first" ends (null clears it). */
    pathOff: z.array(z.enum(PATH_OPTIONAL_TYPES)).max(PATH_OPTIONAL_TYPES.length).optional(),
    pathTrimUntil: isoDate.nullable().optional(),
  })
  .strict();

export type LearnerProfilePatch = z.infer<typeof learnerProfilePatchSchema>;

export type LearnerProfile = Omit<LearnerProfilePatch, "showFlag" | "pathTrimUntil"> & {
  pathTrimUntil?: string;
  showFlag: boolean;
  completedAt?: string;
  dismissedAt?: string;
};

function pick<T>(schema: z.ZodType<T>, value: unknown): T | undefined {
  const r = schema.safeParse(value);
  return r.success ? r.data : undefined;
}

/** Field by field: one bad value drops that value, never the rest. */
export function parseLearnerProfile(raw: unknown): LearnerProfile {
  const v = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const shape = learnerProfilePatchSchema.shape;
  const out: LearnerProfile = { showFlag: v.showFlag === true };
  const name = pick(shape.name, v.name);
  if (name) out.name = name;
  const course = pick(shape.course, v.course);
  if (course) out.course = course;
  const nativeLanguage = pick(shape.nativeLanguage, v.nativeLanguage);
  if (nativeLanguage) out.nativeLanguage = nativeLanguage;
  const explainMode = pick(shape.explainMode, v.explainMode);
  if (explainMode) out.explainMode = explainMode;
  const country = pick(shape.country, v.country);
  if (country) out.country = country;
  const goal = pick(shape.goal, v.goal);
  if (goal) out.goal = goal;
  const level = pick(shape.level, v.level);
  if (level) out.level = level;
  const dailyMinutes = pick(shape.dailyMinutes, v.dailyMinutes);
  if (dailyMinutes) out.dailyMinutes = dailyMinutes;
  const ageRange = pick(shape.ageRange, v.ageRange);
  if (ageRange) out.ageRange = ageRange;
  if (Array.isArray(v.interests)) {
    out.interests = v.interests.filter((i): i is Interest =>
      (INTERESTS as readonly unknown[]).includes(i),
    );
  }
  const heardFrom = pick(shape.heardFrom, v.heardFrom);
  if (heardFrom) out.heardFrom = heardFrom;
  if (Array.isArray(v.pathOff)) {
    out.pathOff = [...new Set(v.pathOff)].filter((t): t is PathOptionalType =>
      (PATH_OPTIONAL_TYPES as readonly unknown[]).includes(t),
    );
  }
  const pathTrimUntil = pick(isoDate, v.pathTrimUntil);
  if (pathTrimUntil) out.pathTrimUntil = pathTrimUntil;
  const completedAt = pick(isoTime, v.completedAt);
  if (completedAt) out.completedAt = completedAt;
  const dismissedAt = pick(isoTime, v.dismissedAt);
  if (dismissedAt) out.dismissedAt = dismissedAt;
  return out;
}

export function mergeLearnerProfile(
  current: LearnerProfile,
  patch: LearnerProfilePatch & { completedAt?: string; dismissedAt?: string },
): LearnerProfile {
  return parseLearnerProfile({ ...current, ...patch });
}

/** "Complete your profile" shows once: until the learner finishes it or says Not now. */
export function needsCompleteProfile(profile: LearnerProfile): boolean {
  return !profile.completedAt && !profile.dismissedAt;
}
