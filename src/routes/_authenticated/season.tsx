import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BackPill,
  DsButton,
  DsCard,
  DsHero,
  GlassTitle,
  HeroKicker,
  Icon,
  Overline,
  PoseCard,
} from "@/components/ds/Blocks";
import { DsScreen } from "@/components/ds/DsScreen";
import { getSeasonStatus } from "../../lib/season.functions";

export const Route = createFileRoute("/_authenticated/season")({
  component: SeasonPage,
  head: () => ({ meta: [{ title: "Season — Alphonso" }] }),
});

function SeasonPage() {
  const {
    data: status,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["seasonStatus"],
    queryFn: () => getSeasonStatus(),
  });

  return (
    <DsScreen scene="profile">
      <BackPill to="/league" label="Back to league">
        League
      </BackPill>
      <GlassTitle title="Season" />

      {isLoading ? (
        <DsCard aria-busy="true">
          <div className="h-[34px] w-3/5 rounded-[10px] bg-ds-sunk" />
          <div className="h-4 w-2/5 rounded-lg bg-ds-sunk" />
          <p role="status" className="ds-type-caption text-center text-ds-ink-soft">
            Loading your season…
          </p>
        </DsCard>
      ) : status ? (
        <>
          <DsHero aria-label="This week">
            <HeroKicker>This week</HeroKicker>
            <div className="flex items-center gap-3">
              <Icon name="trophy" size={52} />
              <p className="ds-type-display-x-l">Division {status.division}</p>
            </div>
            <p className="ds-type-headline text-ds-on-hero-soft">
              Rank {status.rankInCohort} of {status.cohortSize} this week
            </p>
          </DsHero>
          {status.lastWeekResult && (
            <>
              <Overline>Last week</Overline>
              <DsCard>
                <div className="flex items-center gap-2.5">
                  <Icon name="shield" />
                  <p className="ds-type-headline min-w-0 flex-1 text-ds-ink">
                    Division {status.lastWeekResult.division}, rank{" "}
                    {status.lastWeekResult.rankInCohort} of {status.lastWeekResult.cohortSize}
                  </p>
                </div>
              </DsCard>
            </>
          )}
        </>
      ) : (
        <PoseCard
          src="/mascots/alphonso-encouraging.png"
          title="Couldn't load your season status."
          body="Check your connection and try again."
        >
          <DsButton small variant="secondary" onClick={() => void refetch()}>
            Try again
          </DsButton>
        </PoseCard>
      )}
    </DsScreen>
  );
}
