/**
 * View model for a team's weekly mission (docs/superpowers/specs/2026-10-06-study-together-design.md, Part 1).
 * Everything is computed by the get_team_mission() SQL function; this only parses its row and owns the wording,
 * which is identical on iOS and Android and pinned by team-mission.fixtures.json.
 */
export type TeamMissionStatus = "needs_members" | "in_progress" | "complete";

export type TeamMissionRow = {
  team_id: string;
  week_start: string;
  week_end: string;
  target: number;
  total: number;
  my_count: number;
  member_count: number;
  status: TeamMissionStatus;
  reward_xp: number;
  rewarded: boolean;
};

export type TeamMission = {
  teamId: string;
  weekStart: string;
  weekEnd: string;
  target: number;
  total: number;
  myCount: number;
  memberCount: number;
  status: TeamMissionStatus;
  rewardXp: number;
  rewarded: boolean;
  daysLeft: number;
  percent: number;
  headline: string;
  footer: string;
};

const DAY_MS = 86_400_000;

function normaliseStatus(status: string): TeamMissionStatus {
  return status === "needs_members" || status === "complete" ? status : "in_progress";
}

export function parseTeamMission(
  row: TeamMissionRow | undefined,
  nowMs: number,
): TeamMission | null {
  if (!row) return null;
  const status = normaliseStatus(row.status);
  const daysLeft = Math.max(
    0,
    Math.ceil((Date.parse(`${row.week_end}T00:00:00Z`) - nowMs) / DAY_MS),
  );
  const percent =
    status === "complete"
      ? 100
      : row.target > 0
        ? Math.min(100, Math.floor((row.total / row.target) * 100))
        : 0;
  const timeLeft = daysLeft === 1 ? "Last day" : `${daysLeft} days left`;

  let headline: string;
  let footer: string;
  if (status === "needs_members") {
    headline = "Invite a friend to start your team's weekly mission";
    footer = "";
  } else if (status === "complete") {
    headline = "Mission complete!";
    footer = `+${row.reward_xp} XP for everyone who joined in`;
  } else {
    headline = `${row.total} of ${row.target} lessons done`;
    footer = `You added ${row.my_count} · ${timeLeft}`;
  }

  return {
    teamId: row.team_id,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    target: row.target,
    total: row.total,
    myCount: row.my_count,
    memberCount: row.member_count,
    status,
    rewardXp: row.reward_xp,
    rewarded: row.rewarded,
    daysLeft,
    percent,
    headline,
    footer,
  };
}
