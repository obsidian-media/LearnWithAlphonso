import type { Goal, Interest } from "../lib/learner-profile";
import type { Skill } from "../lib/profile-data";
import type { Level } from "./levels";

/**
 * THE REVIEWED TAGGING FILE for the learning path (docs/superpowers/specs/2026-11-12-learning-path-design.md).
 * Every podcast episode, practice scenario and story campaign is mapped to the goals it serves, the interests it
 * touches, its CEFR level and the skills it trains. The plan engine (src/lib/path-plan.ts) reads ONLY this file for
 * those links: the rules are code, the tags are data, and the owner reviews the tags.
 *
 * - `goals` are the first-run answers (learner-profile GOALS). Several are allowed.
 * - `level` is the lowest level the item suits (the engine never offers an item above the learner's level).
 * - `skills` are skills in the Skills radar (profile-data SKILLS) the item exercises.
 * Guarded by path-tags.test.ts: every live podcast quiz episode, every scenario and every campaign has a tag.
 */
export type PathTag = {
  goals: readonly Goal[];
  interests: readonly Interest[];
  level: Level;
  skills: readonly Skill[];
};

const t = (
  level: Level,
  goals: readonly Goal[],
  interests: readonly Interest[],
  skills: readonly Skill[],
): PathTag => ({ level, goals, interests, skills });

/** Podcast episodes, keyed `course/folder/slug` (episode ids are random per database). */
export const PODCAST_TAGS: Readonly<Record<string, PathTag>> = {
  "en/a1/ordering-coffee-v2": t(
    "A1",
    ["travel", "fun", "family"],
    ["food"],
    ["listening", "vocabulary"],
  ),
  "en/b1/why-phones-are-addictive-v2": t("B1", ["school", "work", "fun"], ["tech"], ["listening"]),
  "en/c1/does-money-buy-happiness-v2": t(
    "C1",
    ["work", "exam", "fun"],
    ["business"],
    ["listening"],
  ),
  "en/c1/why-cant-we-focus-v2": t("C1", ["school", "work", "exam"], ["tech"], ["listening"]),
  "en/c1/why-time-feels-faster-v2": t("C1", ["exam", "fun"], ["nature"], ["listening"]),
  "en/c1/why-changing-minds-is-hard-v2": t("C1", ["work", "exam"], ["business"], ["listening"]),
  "en/c1/why-we-procrastinate-v2": t("C1", ["school", "work", "exam"], [], ["listening"]),
  "en/c1/why-everyone-looks-better-online-v2": t(
    "C1",
    ["fun", "exam"],
    ["tech", "art"],
    ["listening"],
  ),
  "en/mind-fools-you/why-we-trust-our-gut-v2": t("C1", ["exam", "fun"], [], ["listening"]),
  "en/why-we-love/why-we-fall-for-the-same-type-v2": t(
    "C1",
    ["family", "fun"],
    ["family"],
    ["listening"],
  ),
  "fr/a1/au-cafe": t("A1", ["travel", "fun", "family"], ["food"], ["listening", "vocabulary"]),
  "fr/a2/ma-journee": t("A2", ["family", "school", "fun"], [], ["listening", "grammar"]),
  "fr/b1/chercher-un-appartement": t(
    "B1",
    ["work", "family", "travel"],
    [],
    ["listening", "vocabulary"],
  ),
  "es/a1/en-la-cafeteria": t(
    "A1",
    ["travel", "fun", "family"],
    ["food"],
    ["listening", "vocabulary"],
  ),
  "es/a2/mi-fin-de-semana": t(
    "A2",
    ["family", "fun", "school"],
    ["sport", "music"],
    ["listening", "grammar"],
  ),
  "es/b1/buscar-departamento": t(
    "B1",
    ["work", "family", "travel"],
    [],
    ["listening", "vocabulary"],
  ),
};

/** Talk to Alphonso scenarios (src/data/scenarios.ts ids). */
export const SCENARIO_TAGS: Readonly<Record<string, PathTag>> = {
  coffee: t("A1", ["travel", "fun", "family"], ["food"], ["speaking"]),
  airport: t("A1", ["travel"], ["travel"], ["speaking", "listening"]),
  smalltalk: t("A1", ["fun", "family", "school"], ["music", "movies", "sport"], ["speaking"]),
  hotel: t("A2", ["travel"], ["travel"], ["speaking"]),
  directions: t("A1", ["travel"], ["travel"], ["speaking", "listening"]),
  restaurant: t("A2", ["travel", "fun", "family"], ["food"], ["speaking", "vocabulary"]),
  apartment: t("B1", ["work", "family"], [], ["speaking", "vocabulary"]),
  doctor: t("B1", ["family", "travel"], [], ["speaking", "vocabulary"]),
  returns: t("B1", ["work", "fun"], [], ["speaking", "grammar"]),
  interview: t("B1", ["work", "exam"], ["business"], ["speaking"]),
  negotiation: t("B2", ["work"], ["business"], ["speaking"]),
  debate: t("B2", ["school", "exam"], [], ["speaking", "grammar"]),
};

/** Story campaigns (src/data/campaigns.ts ids). A scene is the item; the campaign carries the tag. */
export const CAMPAIGN_TAGS: Readonly<Record<string, PathTag>> = {
  "city-day": t("A1", ["travel", "fun"], ["food", "travel"], ["speaking", "reading"]),
  "market-day": t("A1", ["travel", "family", "fun"], ["food"], ["speaking", "vocabulary"]),
  "first-week-job": t("A2", ["work"], ["business", "food"], ["speaking", "vocabulary"]),
  "dinner-guest": t("A2", ["family", "fun"], ["food", "family"], ["speaking"]),
  "train-trip": t("B1", ["travel"], ["travel"], ["speaking", "listening"]),
  "lost-bag": t("B1", ["travel"], ["travel"], ["speaking", "vocabulary"]),
  "doctors-visit": t("B1", ["family", "travel"], [], ["speaking", "vocabulary"]),
  "new-flat": t("B1", ["family", "work"], [], ["speaking", "vocabulary"]),
  "refund-return": t("B1", ["work", "fun"], [], ["speaking", "grammar"]),
};

export const podcastTagKey = (course: string, folder: string, slug: string) =>
  `${course}/${folder}/${slug}`;
