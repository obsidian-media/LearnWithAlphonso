import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  BackPill,
  DsButton,
  DsCard,
  DsEmptyState,
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
import { invalidateTeamQueries } from "../../lib/team-queries";
import { useInFlight } from "../../lib/use-in-flight";

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
  const {
    data: leaderboard,
    isLoading: loadingBoard,
    isError: boardFailed,
    refetch: retryBoard,
  } = useQuery({
    queryKey: ["teamLeaderboard"],
    queryFn: () => getTeamLeaderboard(),
    retry: false,
  });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One join or create at a time: the state above is for the look; the ref stops a second click before a re-render.
  const inFlight = useInFlight();
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
  // Only when nothing is known: a failed refresh after "no team" keeps the join and create forms.
  if (myTeamFailed && myTeam === undefined)
    return (
      <DsScreen scene="profile">
        <GlassTitle title="Teams" />
        <DsEmptyState
          tone="error"
          art="/mascots/alphonso-encouraging.png"
          title="Couldn't load your team."
          message="Check your connection and try again."
        >
          <DsButton small variant="secondary" onClick={() => retryMyTeam()}>
            Try again
          </DsButton>
        </DsEmptyState>
      </DsScreen>
    );

  async function handleJoinByCode() {
    if (!inFlight.begin()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await joinTeamByCode({ data: { code } });
      if (!result.ok) {
        setError(socialReasonMessage(result.reason ?? "unknown-error"));
        return;
      }
      await invalidateTeamQueries(queryClient);
      navigate({ to: "/teams/$teamId", params: { teamId: result.teamId! } });
    } catch (e) {
      setError(socialFailureMessage(e));
    } finally {
      inFlight.end();
      setBusy(false);
    }
  }

  async function handleAutoJoin() {
    if (!inFlight.begin()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await autoJoinTeam();
      if (!result.ok) {
        setError(socialReasonMessage(result.reason ?? "unknown-error"));
        return;
      }
      await invalidateTeamQueries(queryClient);
      navigate({ to: "/teams/$teamId", params: { teamId: result.teamId! } });
    } catch (e) {
      setError(socialFailureMessage(e));
    } finally {
      inFlight.end();
      setBusy(false);
    }
  }

  async function handleCreate() {
    if (!inFlight.begin()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createTeam({ data: { name: teamName, visibility } });
      if (!result.ok) {
        setError(socialReasonMessage(result.reason ?? "unknown-error"));
        return;
      }
      await invalidateTeamQueries(queryClient);
      navigate({ to: "/teams/$teamId", params: { teamId: result.teamId! } });
    } catch (e) {
      setError(socialFailureMessage(e));
    } finally {
      inFlight.end();
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

      <TopTeams
        loading={loadingBoard}
        failed={boardFailed}
        onRetry={() => void retryBoard()}
        rows={leaderboard ?? []}
        myTeamId={null}
      />
    </DsScreen>
  );
}
