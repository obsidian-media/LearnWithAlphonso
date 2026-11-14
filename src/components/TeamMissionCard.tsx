import { useQuery } from "@tanstack/react-query";
import { DsCard, Icon } from "@/components/ds/Blocks";
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
    <DsCard className="gap-2">
      <p className="ds-type-overline text-ds-xp-text">Team mission</p>
      <div className="flex items-center gap-2.5">
        <Icon name="bullseye" />
        <p className="ds-type-headline min-w-0 flex-1 text-ds-ink">{mission.headline}</p>
      </div>
      {showBar && (
        <div
          role="progressbar"
          aria-label="Team mission progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={mission.percent}
          className="h-2.5 overflow-hidden rounded-full bg-ds-sunk"
        >
          <div
            data-testid="team-mission-fill"
            className="h-full rounded-full bg-ds-xp"
            style={{ width: `${mission.percent}%` }}
          />
        </div>
      )}
      {mission.footer && <p className="ds-type-footnote text-ds-ink-soft">{mission.footer}</p>}
    </DsCard>
  );
}
