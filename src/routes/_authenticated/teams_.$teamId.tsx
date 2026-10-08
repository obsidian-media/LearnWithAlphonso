import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MobileFrame } from "../../components/AppShell";
import { TeamMissionCard } from "../../components/TeamMissionCard";
import { useState } from "react";
import { getMyTeam, leaveTeam } from "../../lib/teams.functions";
import { socialReasonMessage } from "../../lib/social-reason-copy";

export const Route = createFileRoute("/_authenticated/teams_/$teamId")({
  component: TeamDetailPage,
});

function TeamDetailPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    data: myTeam,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["myTeam"],
    queryFn: () => getMyTeam(),
  });

  const [notice, setNotice] = useState<string | null>(null);

  async function handleLeave() {
    setNotice(null);
    try {
      const result = await leaveTeam();
      if (!result.ok) {
        setNotice(socialReasonMessage(result.reason ?? "unknown-error"));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["myTeam"] });
      // A plain leave goes back to the list; a hand-on or a close is said first.
      if (result.reason) setNotice(socialReasonMessage(result.reason));
      else navigate({ to: "/teams" });
    } catch {
      setNotice(socialReasonMessage(null));
    }
  }

  if (isLoading)
    return (
      <MobileFrame>
        <p className="p-6 text-sm text-ink-soft">Loading…</p>
      </MobileFrame>
    );
  if (isError)
    return (
      <MobileFrame>
        <div className="p-6">
          <p className="text-sm text-ink-soft">Couldn't load your team.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 rounded-full border border-hairline px-4 py-2.5 text-sm font-semibold text-ink"
          >
            Try again
          </button>
        </div>
      </MobileFrame>
    );
  if (!myTeam)
    return (
      <MobileFrame>
        {/* After leaving, the refetch finds no team: keep saying what happened to it. */}
        {notice ? (
          <div role="status" className="p-6 text-sm text-ink-soft">
            <p>{notice}</p>
            <Link to="/teams" className="underline">
              Back to teams
            </Link>
          </div>
        ) : (
          <p className="p-6 text-sm text-ink-soft">You're not on a team yet.</p>
        )}
      </MobileFrame>
    );

  const locked = new Date(myTeam.switchLockedUntil) > new Date();

  return (
    <MobileFrame>
      <div className="px-6 pb-12 pt-6">
        <div className="flex items-center gap-3">
          <Link to="/league" aria-label="Back to league" className="text-ink-soft/70">
            ←
          </Link>
          <h1 className="font-display text-[22px] font-semibold text-ink">{myTeam.name}</h1>
        </div>
        <p className="mt-4 text-sm text-ink-soft">
          Join code: <span className="tnum font-semibold text-ink">{myTeam.joinCode}</span>
        </p>
        <p className="mt-2 tnum text-2xl font-semibold text-ink">
          {myTeam.thisWeekXp} XP this week
        </p>
        <div className="mt-6">
          <TeamMissionCard />
        </div>
        <button
          type="button"
          onClick={handleLeave}
          disabled={locked}
          className="mt-8 text-sm font-medium text-rose-500 underline underline-offset-4 disabled:opacity-40"
        >
          {locked ? "Can't leave yet (7-day lock)" : "Leave team"}
        </button>
        {notice && (
          <div role="status" className="mt-3 text-sm text-ink-soft">
            <p>{notice}</p>
            <Link to="/teams" className="underline">
              Back to teams
            </Link>
          </div>
        )}
      </div>
    </MobileFrame>
  );
}
