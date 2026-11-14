import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ProfileAvatar } from "@/components/ds/ProfileAvatar";
import {
  BackPill,
  DsButton,
  DsCard,
  DsHero,
  DsPill,
  DsRow,
  DsScreen,
  GlassTitle,
  HeroKicker,
  Overline,
} from "@/components/ds/Blocks";
import { TopTeams } from "@/components/teams/TeamParts";
import { SocialSafetyMenu } from "../../components/SocialSafetyMenu";
import { TeamMissionCard } from "../../components/TeamMissionCard";
import {
  getMyTeam,
  getTeamLeaderboard,
  getTeamMembers,
  kickTeamMember,
  leaveTeam,
  type TeamMember,
} from "../../lib/teams.functions";
import { socialFailureMessage, socialReasonMessage } from "../../lib/social-reason-copy";

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
  const { data: members } = useQuery({
    queryKey: ["teamMembers"],
    queryFn: () => getTeamMembers(),
    enabled: !!myTeam,
  });
  const { data: leaderboard, isLoading: loadingBoard } = useQuery({
    queryKey: ["teamLeaderboard"],
    queryFn: () => getTeamLeaderboard(),
    enabled: !!myTeam,
  });

  const [notice, setNotice] = useState<string | null>(null);
  const [left, setLeft] = useState(false);
  const [shared, setShared] = useState(false);
  const [kickId, setKickId] = useState<string | null>(null);

  async function handleLeave() {
    setNotice(null);
    setLeft(false);
    try {
      const result = await leaveTeam();
      if (!result.ok) {
        setNotice(socialReasonMessage(result.reason ?? "unknown-error"));
        return;
      }
      setLeft(true);
      await queryClient.invalidateQueries({ queryKey: ["myTeam"] });
      // A plain leave goes back to the list; a hand-on or a close is said first.
      if (result.reason) setNotice(socialReasonMessage(result.reason));
      else navigate({ to: "/teams" });
    } catch (e) {
      setNotice(socialFailureMessage(e));
    }
  }

  async function handleKick(member: TeamMember) {
    setNotice(null);
    try {
      const result = await kickTeamMember({ data: { userId: member.userId } });
      if (!result.ok) {
        setNotice(socialReasonMessage(result.reason ?? "unknown-error"));
        return;
      }
      setKickId(null);
      await queryClient.invalidateQueries({ queryKey: ["teamMembers"] });
      await queryClient.invalidateQueries({ queryKey: ["teamMission"] });
    } catch (e) {
      setNotice(socialFailureMessage(e));
    }
  }

  if (isLoading)
    return (
      <DsScreen scene="profile">
        <GlassTitle title="Teams" />
        <DsCard>
          <p className="ds-type-footnote text-ds-ink-soft">Loading…</p>
        </DsCard>
      </DsScreen>
    );
  if (isError)
    return (
      <DsScreen scene="profile">
        <GlassTitle title="Teams" />
        <DsCard>
          <p className="ds-type-body text-ds-ink">Couldn't load your team.</p>
          <div>
            <DsButton small variant="secondary" onClick={() => refetch()}>
              Try again
            </DsButton>
          </div>
        </DsCard>
      </DsScreen>
    );
  if (!myTeam)
    return (
      <DsScreen scene="profile">
        <GlassTitle title="Teams" />
        {/* After leaving, the refetch finds no team: keep saying what happened to it. */}
        {notice ? (
          <DsCard role="status">
            <p className="ds-type-body text-ds-ink">{notice}</p>
            <Link to="/teams" className="ds-type-footnote font-extrabold text-ds-choice underline">
              Back to teams
            </Link>
          </DsCard>
        ) : (
          <DsCard>
            <p className="ds-type-body text-ds-ink-soft">You're not on a team yet.</p>
          </DsCard>
        )}
      </DsScreen>
    );

  const locked = new Date(myTeam.switchLockedUntil) > new Date();

  async function share() {
    if (!myTeam) return;
    const text = `Join my team "${myTeam.name}" on Learn with Alphonso! Enter code ${myTeam.joinCode} under Teams → Join a team.`;
    try {
      if (typeof navigator.share === "function") await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      }
    } catch {
      // A dismissed share sheet is not an error.
    }
  }

  return (
    <DsScreen scene="profile">
      <BackPill to="/league" label="Back to league">
        League
      </BackPill>

      <DsHero aria-label="Your team">
        <HeroKicker>Your team</HeroKicker>
        <h1 className="ds-type-display">{myTeam.name}</h1>
        <p className="ds-type-headline tnum text-ds-on-hero-kick">
          {myTeam.thisWeekXp} XP this week
        </p>
        <div className="flex items-center gap-2.5">
          <p className="ds-type-footnote flex min-h-11 flex-1 items-center rounded-[16px] bg-ds-on-hero/15 px-3">
            Join code: <span className="tnum ml-1 font-extrabold">{myTeam.joinCode}</span>
          </p>
          <button
            type="button"
            onClick={share}
            aria-label="Share team invite"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-ds-action text-ds-on-action shadow-[0_3px_0_var(--c-action-edge)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-on-hero"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
            </svg>
          </button>
        </div>
        <span role="status" aria-live="polite" className="sr-only">
          {shared ? "Invite copied to clipboard" : ""}
        </span>
        {locked && (
          <p className="ds-type-caption text-ds-on-hero-soft">
            Can't leave until{" "}
            {new Date(myTeam.switchLockedUntil).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        )}
      </DsHero>

      <TeamMissionCard />

      {(members ?? []).length > 0 && (
        <>
          <Overline>Members</Overline>
          <DsCard flush>
            {(members ?? []).map((m, i) => (
              <DsRow key={m.userId} first={i === 0} className="min-h-14">
                <ProfileAvatar seed={m.avatarSeed} name={m.displayName} className="size-10" />
                <span className="ds-type-headline min-w-0 flex-1 truncate text-ds-ink">
                  {m.displayName}
                </span>
                {m.isOwner && <DsPill tone="xp">Owner</DsPill>}
                {m.isBlocked && <DsPill tone="wrong">Blocked</DsPill>}
                {myTeam.isOwner && !m.isOwner ? (
                  kickId === m.userId ? (
                    <span className="flex shrink-0 items-center gap-1.5">
                      <DsButton small variant="secondary" onClick={() => setKickId(null)}>
                        Cancel
                      </DsButton>
                      <DsButton small variant="danger" onClick={() => handleKick(m)}>
                        Remove
                      </DsButton>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setKickId(m.userId)}
                      aria-label={`Remove ${m.displayName} from the team`}
                      className="grid size-11 shrink-0 place-items-center rounded-full text-ds-wrong-ink hover:bg-ds-wrong-tint"
                    >
                      ✕
                    </button>
                  )
                ) : null}
                {!m.isBlocked && (
                  <SocialSafetyMenu
                    userId={m.userId}
                    displayName={m.displayName}
                    onBlocked={() => queryClient.invalidateQueries({ queryKey: ["teamMembers"] })}
                  />
                )}
              </DsRow>
            ))}
          </DsCard>
        </>
      )}

      <TopTeams loading={loadingBoard} rows={leaderboard ?? []} myTeamId={myTeam.teamId} />

      <div className="grid justify-items-center gap-2">
        <DsButton small variant="danger" onClick={handleLeave} disabled={locked}>
          {locked ? "Can't leave yet (7-day lock)" : "Leave team"}
        </DsButton>
        {notice && (
          <div role="status" className="ds-type-footnote text-ds-ink-soft">
            <p>{notice}</p>
            {/* Only after leaving: a refused leave keeps them a member, and /teams sends members back here. */}
            {left && (
              <Link to="/teams" className="underline">
                Back to teams
              </Link>
            )}
          </div>
        )}
      </div>
    </DsScreen>
  );
}
