import { useTeamMission } from "../lib/use-team-mission";
import { useWeeklyChallenges } from "../lib/use-weekly-challenges";
import { TeamMissionCard } from "./TeamMissionCard";
import { WeeklyChallengesCard } from "./WeeklyChallengesCard";

/**
 * The team mission and this week's challenges, as Learn shows them. When both reads fail, one notice with one Try
 * again stands in for two stacked alerts saying the same thing; otherwise each card speaks for itself.
 */
export function WeeklySocialCards() {
  const team = useTeamMission();
  const challenges = useWeeklyChallenges();

  if (team.showError && challenges.failed)
    return (
      <div role="alert" className="card-lift rounded-3xl bg-tile-sky-bg p-4">
        <p className="font-display text-sm font-semibold text-ds-ink">This week</p>
        <p className="mt-2 text-xs text-ds-ink-soft">
          Couldn't load your team mission or this week's challenges.
        </p>
        <button
          type="button"
          onClick={() => {
            team.retry();
            challenges.retry();
          }}
          className="mt-2 min-h-11 rounded-full px-3 text-xs font-semibold text-ds-ink underline"
        >
          Try again
        </button>
      </div>
    );

  return (
    <>
      <TeamMissionCard />
      <WeeklyChallengesCard />
    </>
  );
}
