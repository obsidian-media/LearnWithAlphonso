// Client-side mirror of the achievements catalog, used for iconography + labels
// without hitting the DB.
export type AchievementCategory =
  | "streak"
  | "xp"
  | "perfect"
  | "lessons"
  | "league"
  | "freeze";

export type AchievementTier = "bronze" | "silver" | "gold" | "diamond";

export type Achievement = {
  id: string;
  title: string;
  description: string;
  icon: string;
  tier: AchievementTier;
  category: AchievementCategory;
  threshold: number;
};

export const ACHIEVEMENTS: Achievement[] = [
  { id: "streak_3", title: "Warming up", description: "Reach a 3-day streak", icon: "flame", tier: "bronze", category: "streak", threshold: 3 },
  { id: "streak_7", title: "One full week", description: "Reach a 7-day streak", icon: "flame", tier: "silver", category: "streak", threshold: 7 },
  { id: "streak_30", title: "Iron habit", description: "Reach a 30-day streak", icon: "flame", tier: "gold", category: "streak", threshold: 30 },
  { id: "streak_100", title: "Centurion", description: "Reach a 100-day streak", icon: "flame", tier: "diamond", category: "streak", threshold: 100 },
  { id: "xp_100", title: "First strides", description: "Earn 100 XP", icon: "bolt", tier: "bronze", category: "xp", threshold: 100 },
  { id: "xp_500", title: "Getting fluent", description: "Earn 500 XP", icon: "bolt", tier: "silver", category: "xp", threshold: 500 },
  { id: "xp_2000", title: "Scholar", description: "Earn 2,000 XP", icon: "bolt", tier: "gold", category: "xp", threshold: 2000 },
  { id: "xp_10000", title: "Polyglot", description: "Earn 10,000 XP", icon: "bolt", tier: "diamond", category: "xp", threshold: 10000 },
  { id: "perfect_1", title: "Flawless", description: "Finish 1 lesson with no mistakes", icon: "star", tier: "bronze", category: "perfect", threshold: 1 },
  { id: "perfect_10", title: "Sharp mind", description: "Finish 10 perfect lessons", icon: "star", tier: "silver", category: "perfect", threshold: 10 },
  { id: "perfect_50", title: "Grammar sensei", description: "Finish 50 perfect lessons", icon: "star", tier: "gold", category: "perfect", threshold: 50 },
  { id: "lessons_5", title: "Explorer", description: "Complete 5 lessons", icon: "check", tier: "bronze", category: "lessons", threshold: 5 },
  { id: "lessons_25", title: "Committed", description: "Complete 25 lessons", icon: "check", tier: "silver", category: "lessons", threshold: 25 },
  { id: "lessons_100", title: "Devoted", description: "Complete 100 lessons", icon: "check", tier: "gold", category: "lessons", threshold: 100 },
  { id: "league_promote_1", title: "Rising star", description: "Advance to a new league", icon: "shield", tier: "silver", category: "league", threshold: 1 },
  { id: "league_promote_3", title: "Ascendant", description: "Advance to a league 3 times", icon: "shield", tier: "gold", category: "league", threshold: 3 },
  { id: "freeze_earn_1", title: "Ice reserve", description: "Earn your first streak freeze", icon: "snow", tier: "bronze", category: "freeze", threshold: 1 },
  { id: "freeze_earn_5", title: "Cold storage", description: "Bank 5 streak freezes", icon: "snow", tier: "silver", category: "freeze", threshold: 5 },
];

export const ACHIEVEMENTS_BY_ID: Record<string, Achievement> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);

export const TIER_ORDER: AchievementTier[] = ["bronze", "silver", "gold", "diamond"];

export const LEAGUE_TIERS = ["bronze", "silver", "sapphire", "ruby", "diamond"] as const;
export type LeagueTier = (typeof LEAGUE_TIERS)[number];

export const LEAGUE_TIER_META: Record<
  LeagueTier,
  { label: string; hex: string; sub: string }
> = {
  bronze: { label: "Bronze", hex: "#b07242", sub: "Getting started" },
  silver: { label: "Silver", hex: "#8a9099", sub: "Warming up" },
  sapphire: { label: "Sapphire", hex: "#4a6b8a", sub: "Consistent" },
  ruby: { label: "Ruby", hex: "#9a4a4a", sub: "Serious" },
  diamond: { label: "Diamond", hex: "#4a7f7a", sub: "Elite" },
};