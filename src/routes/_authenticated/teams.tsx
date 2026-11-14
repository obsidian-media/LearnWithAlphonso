import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  BackPill,
  DsButton,
  DsCard,
  DsField,
  DsSegmented,
  GlassTitle,
  Overline,
} from "@/components/ds/Blocks";
import { DsScreen } from "@/components/ds/DsScreen";
import { TopTeams } from "@/components/teams/TeamParts";
import { canCreate, canJoin } from "../../lib/social-presentation";
import {
  getMyTeam,
  getTeamLeaderboard,
  joinTeamByCode,
  autoJoinTeam,
  createTeam,
} from "../../lib/teams.functions";
import { socialFailureMessage, socialReasonMessage } from "../../lib/social-reason-copy";

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
  const {
    data: myTeam,
    isLoading: loadingMyTeam,
    isError: myTeamFailed,
    refetch: retryMyTeam,
  } = useQuery({
    queryKey: ["myTeam"],
    queryFn: () => getMyTeam(),
    // A failing lookup is not transient (the default 3 retries would show the forms for ~7 s first).
    retry: false,
  });
  const { data: leaderboard, isLoading: loadingBoard } = useQuery({
    queryKey: ["teamLeaderboard"],
    queryFn: () => getTeamLeaderboard(),
  });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");

  if (!loadingMyTeam && myTeam) {
    navigate({ to: "/teams/$teamId", params: { teamId: myTeam.teamId } });
    return null;
  }

  if (loadingMyTeam)
    return (
      <DsScreen scene="profile">
        <GlassTitle title="Teams" />
        <DsCard>
          <p className="ds-type-footnote text-ds-ink-soft">Loading…</p>
        </DsCard>
      </DsScreen>
    );
  if (myTeamFailed)
    return (
      <DsScreen scene="profile">
        <GlassTitle title="Teams" />
        <DsCard>
          <p className="ds-type-body text-ds-ink">Couldn't load your team.</p>
          <div>
            <DsButton small variant="secondary" onClick={() => retryMyTeam()}>
              Try again
            </DsButton>
          </div>
        </DsCard>
      </DsScreen>
    );

  async function handleJoinByCode() {
    setBusy(true);
    setError(null);
    try {
      const result = await joinTeamByCode({ data: { code } });
      if (!result.ok) {
        setError(socialReasonMessage(result.reason ?? "unknown-error"));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["myTeam"] });
      navigate({ to: "/teams/$teamId", params: { teamId: result.teamId! } });
    } catch (e) {
      setError(socialFailureMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleAutoJoin() {
    setBusy(true);
    setError(null);
    try {
      const result = await autoJoinTeam();
      if (!result.ok) {
        setError(socialReasonMessage(result.reason ?? "unknown-error"));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["myTeam"] });
      navigate({ to: "/teams/$teamId", params: { teamId: result.teamId! } });
    } catch (e) {
      setError(socialFailureMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      const result = await createTeam({ data: { name: teamName, visibility } });
      if (!result.ok) {
        setError(socialReasonMessage(result.reason ?? "unknown-error"));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["myTeam"] });
      navigate({ to: "/teams/$teamId", params: { teamId: result.teamId! } });
    } catch (e) {
      setError(socialFailureMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DsScreen scene="profile">
      <BackPill to="/league" label="Back to league">
        League
      </BackPill>
      <GlassTitle title="Teams" />

      <Overline>Join a team</Overline>
      <DsCard>
        <DsField
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Join code"
          aria-label="Join code"
          autoCapitalize="characters"
        />
        <DsButton full onClick={handleJoinByCode} disabled={busy || !canJoin(code)}>
          Join by code
        </DsButton>
        <DsButton full variant="secondary" onClick={handleAutoJoin} disabled={busy}>
          Put me on a team
        </DsButton>
        {error && (
          <p role="alert" className="ds-type-footnote font-bold text-ds-wrong-ink">
            {error}
          </p>
        )}
      </DsCard>

      <Overline>Create a team</Overline>
      <DsCard>
        <DsField
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          placeholder="Team name"
          aria-label="Team name"
          maxLength={40}
        />
        <DsSegmented
          ariaLabel="Team visibility"
          value={visibility}
          onChange={setVisibility}
          options={[
            { value: "public", label: "Public" },
            { value: "private", label: "Private" },
          ]}
        />
        <DsButton full onClick={handleCreate} disabled={busy || !canCreate(teamName)}>
          Create team
        </DsButton>
      </DsCard>

      <TopTeams loading={loadingBoard} rows={leaderboard ?? []} myTeamId={null} />
    </DsScreen>
  );
}
