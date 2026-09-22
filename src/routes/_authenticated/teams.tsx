import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MobileFrame } from "../../components/AppShell";
import {
  getMyTeam,
  getTeamLeaderboard,
  joinTeamByCode,
  autoJoinTeam,
} from "../../lib/teams.functions";

export const Route = createFileRoute("/_authenticated/teams")({
  component: TeamsPage,
  head: () => ({
    meta: [
      { title: "Teams — Alphonso" },
      { name: "description", content: "Join a team and compete on weekly XP." },
    ],
  }),
});

function TeamsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: myTeam, isLoading: loadingMyTeam } = useQuery({
    queryKey: ["myTeam"],
    queryFn: () => getMyTeam(),
  });
  const { data: leaderboard, isLoading: loadingBoard } = useQuery({
    queryKey: ["teamLeaderboard"],
    queryFn: () => getTeamLeaderboard(),
  });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loadingMyTeam && myTeam) {
    navigate({ to: "/teams/$teamId", params: { teamId: myTeam.teamId } });
    return null;
  }

  async function handleJoinByCode() {
    setBusy(true);
    setError(null);
    const result = await joinTeamByCode({ data: { code } });
    setBusy(false);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["myTeam"] });
    navigate({ to: "/teams/$teamId", params: { teamId: result.teamId! } });
  }

  async function handleAutoJoin() {
    setBusy(true);
    setError(null);
    const result = await autoJoinTeam();
    setBusy(false);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["myTeam"] });
    navigate({ to: "/teams/$teamId", params: { teamId: result.teamId! } });
  }

  return (
    <MobileFrame>
      <div className="px-6 pb-12 pt-6">
        <div className="flex items-center gap-3">
          <Link to="/league" aria-label="Back to league" className="text-ink-soft/70">
            ←
          </Link>
          <h1 className="font-display text-[22px] font-semibold text-ink">Teams</h1>
        </div>

        <div className="mt-6 space-y-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Join code"
            className="w-full rounded-xl border border-hairline px-4 py-2.5 text-sm"
          />
          <button
            type="button"
            onClick={handleJoinByCode}
            disabled={busy || !code}
            className="w-full rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-surface disabled:opacity-50"
          >
            Join by code
          </button>
          <button
            type="button"
            onClick={handleAutoJoin}
            disabled={busy}
            className="w-full rounded-full border border-hairline px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-50"
          >
            Put me on a team
          </button>
          {error && <p className="text-xs text-rose-500">{error}</p>}
        </div>

        <h2 className="mt-8 font-display text-[18px] font-semibold text-ink">
          This week's top teams
        </h2>
        {loadingBoard ? (
          <p className="mt-3 text-sm text-ink-soft">Loading…</p>
        ) : (
          <div className="mt-3 space-y-2">
            {(leaderboard ?? []).map((t, i) => (
              <div
                key={t.teamId}
                className="flex items-center justify-between rounded-2xl border border-hairline bg-surface p-3.5"
              >
                <span className="text-sm font-semibold text-ink">
                  {i + 1}. {t.name}
                </span>
                <span className="tnum text-sm text-ink-soft">{t.weeklyXp} XP</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </MobileFrame>
  );
}
