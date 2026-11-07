import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MobileFrame } from "../../components/AppShell";
import { getSeasonStatus } from "../../lib/season.functions";

export const Route = createFileRoute("/_authenticated/season")({
  component: SeasonPage,
  head: () => ({ meta: [{ title: "Season — Alphonso" }] }),
});

function SeasonPage() {
  const { data: status, isLoading } = useQuery({
    queryKey: ["seasonStatus"],
    queryFn: () => getSeasonStatus(),
  });

  return (
    <MobileFrame>
      <div className="px-6 pb-12 pt-6">
        <div className="flex items-center gap-3">
          <Link to="/league" aria-label="Back to league" className="text-ds-ink-soft/70">
            ←
          </Link>
          <h1 className="font-display ds-type-title font-semibold text-ds-ink">Season</h1>
        </div>

        {isLoading ? (
          <p className="mt-6 text-sm text-ds-ink-soft">Loading…</p>
        ) : status ? (
          <>
            <p className="mt-6 font-display ds-type-display font-semibold text-ds-ink">
              Division {status.division}
            </p>
            <p className="mt-1 text-sm text-ds-ink-soft">
              Rank {status.rankInCohort} of {status.cohortSize} this week
            </p>
            {status.lastWeekResult && (
              <p className="mt-4 text-xs text-ds-ink-soft/80">
                Last week: Division {status.lastWeekResult.division}, rank{" "}
                {status.lastWeekResult.rankInCohort} of {status.lastWeekResult.cohortSize}
              </p>
            )}
          </>
        ) : (
          <p className="mt-6 text-sm text-ds-ink-soft">Couldn't load your season status.</p>
        )}
      </div>
    </MobileFrame>
  );
}
