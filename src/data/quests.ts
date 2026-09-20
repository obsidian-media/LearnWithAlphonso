// Client-side mirror of the weekly_quests catalog (supabase/migrations/
// 20260920060000_v3_engagement_mechanics.sql), used for display without
// hitting the DB -- same pattern as achievements.ts. The DB copy is the
// actual source of truth claim_weekly_quest validates against; this is
// display-only and must be kept in sync by hand.
export type QuestMetric = "xp_earned" | "lessons_completed";

export type Quest = {
  id: string;
  title: string;
  description: string;
  icon: string;
  metric: QuestMetric;
  target: number;
  xpReward: number;
};

export const QUESTS: Quest[] = [
  {
    id: "weekly_xp_150",
    title: "Weekly Grinder",
    description: "Earn 150 XP this week",
    icon: "bolt",
    metric: "xp_earned",
    target: 150,
    xpReward: 30,
  },
  {
    id: "weekly_xp_500",
    title: "XP Marathon",
    description: "Earn 500 XP this week",
    icon: "bolt",
    metric: "xp_earned",
    target: 500,
    xpReward: 100,
  },
  {
    id: "weekly_lessons_5",
    title: "Lesson Streak",
    description: "Complete 5 lessons this week",
    icon: "check",
    metric: "lessons_completed",
    target: 5,
    xpReward: 40,
  },
];

export const QUESTS_BY_ID: Record<string, Quest> = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

/**
 * The Monday (UTC) that starts the current week, as a `YYYY-MM-DD` date
 * string -- matches claim_weekly_quest's week-boundary reasoning
 * server-side. Getting this wrong client-side isn't a trust concern (the
 * RPC independently validates `_week_start` is within the last 7 days and
 * recomputes progress itself), just a display-accuracy one.
 */
export function currentWeekStart(now: Date = new Date()): string {
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = utc.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  const daysSinceMonday = (day + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - daysSinceMonday);
  return utc.toISOString().slice(0, 10);
}
