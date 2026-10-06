import { useQuery } from "@tanstack/react-query";
import { getTeamMission } from "../lib/teams.functions";

/** The team's weekly shared mission. Renders nothing without a team, while loading or if the call fails. */
export function TeamMissionCard() {
  const { data: mission } = useQuery({
    queryKey: ["teamMission"],
    queryFn: () => getTeamMission(),
  });

  if (!mission) return null;
  const showBar = mission.status !== "needs_members";

  return (
    <div className="rounded-2xl border border-hairline bg-parchment p-4">
      <p className="font-display text-sm font-semibold text-ink">Team mission</p>
      <p className="mt-2 text-sm text-ink">{mission.headline}</p>
      {showBar && (
        <div
          role="progressbar"
          aria-label="Team mission progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={mission.percent}
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-hairline"
        >
          <div
            data-testid="team-mission-fill"
            className="h-full rounded-full bg-moss"
            style={{ width: `${mission.percent}%` }}
          />
        </div>
      )}
      {mission.footer && <p className="mt-2 text-xs text-ink-soft">{mission.footer}</p>}
    </div>
  );
}
