import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MobileFrame } from "../../components/AppShell";
import { getMyTeam, leaveTeam } from "../../lib/teams.functions";

export const Route = createFileRoute("/_authenticated/teams_/$teamId")({
  component: TeamDetailPage,
});

function TeamDetailPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: myTeam, isLoading } = useQuery({
    queryKey: ["myTeam"],
    queryFn: () => getMyTeam(),
  });

  async function handleLeave() {
    const result = await leaveTeam();
    if (result.ok) {
      await queryClient.invalidateQueries({ queryKey: ["myTeam"] });
      navigate({ to: "/teams" });
    }
  }

  if (isLoading)
    return (
      <MobileFrame>
        <p className="p-6 text-sm text-ink-soft">Loading…</p>
      </MobileFrame>
    );
  if (!myTeam)
    return (
      <MobileFrame>
        <p className="p-6 text-sm text-ink-soft">You're not on a team yet.</p>
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
        <button
          type="button"
          onClick={handleLeave}
          disabled={locked}
          className="mt-8 text-sm font-medium text-rose-500 underline underline-offset-4 disabled:opacity-40"
        >
          {locked ? "Can't leave yet (7-day lock)" : "Leave team"}
        </button>
      </div>
    </MobileFrame>
  );
}
