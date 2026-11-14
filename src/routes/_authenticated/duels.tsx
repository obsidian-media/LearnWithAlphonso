import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ProfileAvatar } from "@/components/ds/ProfileAvatar";
import {
  BackPill,
  DsBar,
  DsButton,
  DsCard,
  DsChip,
  DsPill,
  DsRow,
  DsSegmented,
  DsSwitch,
  GlassTitle,
  Icon,
  Overline,
} from "@/components/ds/Blocks";
import { DsScreen } from "@/components/ds/DsScreen";
import { getMyDuels, createDuel, respondToDuel, getFriends } from "../../lib/friends.functions";
import { getMyProfile } from "../../lib/leaderboard.functions";
import { joinOpenDuelQueue, leaveOpenDuelQueue } from "../../lib/challenges.functions";
import { socialFailureMessage, socialReasonMessage } from "../../lib/social-reason-copy";
import { duelResult, duelShare, duelsSummary } from "../../lib/social-presentation";

export const Route = createFileRoute("/_authenticated/duels")({
  component: DuelsPage,
  head: () => ({
    meta: [
      { title: "Duels — Alphonso" },
      { name: "description", content: "Race a friend or a stranger on XP." },
    ],
  }),
});

const COURSE_OPTIONS = [
  { id: "en", label: "English" },
  { id: "fr", label: "French" },
  { id: "es", label: "Spanish" },
] as const;

function DuelsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => getMyProfile() });
  const { data: duels, isLoading: loadingDuels } = useQuery({
    queryKey: ["myDuels"],
    queryFn: () => getMyDuels(),
  });
  const { data: friends } = useQuery({ queryKey: ["friends"], queryFn: () => getFriends() });

  const [challengeFriendId, setChallengeFriendId] = useState("");
  const [challengeCourse, setChallengeCourse] = useState<"en" | "fr" | "es">("en");
  const [openCourse, setOpenCourse] = useState<"en" | "fr" | "es">("en");
  const [matchByLevel, setMatchByLevel] = useState(true);
  const [queueing, setQueueing] = useState(false);
  const [waitingInQueue, setWaitingInQueue] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const myId = me?.id;
  const pending = (duels ?? []).filter((d) => d.status === "pending" && d.opponentId === myId);
  const active = (duels ?? []).filter((d) => d.status === "active");
  const finished = (duels ?? []).filter((d) => d.status === "completed" || d.status === "declined");

  async function refetchDuels() {
    await queryClient.invalidateQueries({ queryKey: ["myDuels"] });
  }

  async function handleRespond(duelId: string, accept: boolean) {
    setError(null);
    try {
      const result = await respondToDuel({ data: { duelId, accept } });
      if (!result.ok) {
        setError(socialReasonMessage(result.reason ?? "unknown-error"));
        return;
      }
      await refetchDuels();
    } catch (e) {
      setError(socialFailureMessage(e));
    }
  }

  async function handleChallengeFriend() {
    if (!challengeFriendId) return;
    setError(null);
    try {
      const result = await createDuel({
        data: { opponentId: challengeFriendId, course: challengeCourse },
      });
      if (!result.ok) {
        setError(socialReasonMessage(result.reason ?? "unknown-error"));
        return;
      }
      setChallengeFriendId("");
      await refetchDuels();
    } catch (e) {
      setError(socialFailureMessage(e));
    }
  }

  async function handleJoinOpenQueue() {
    setQueueing(true);
    setError(null);
    const result = await joinOpenDuelQueue({ data: { course: openCourse, matchByLevel } });
    setQueueing(false);
    if (result.matched) {
      setWaitingInQueue(false);
      await refetchDuels();
    } else {
      setWaitingInQueue(true);
    }
  }

  async function handleLeaveQueue() {
    await leaveOpenDuelQueue();
    setWaitingInQueue(false);
  }

  const summary = duelsSummary({
    pending: pending.length,
    active: active.length,
    finished: finished.length,
  });
  const courseOptions = COURSE_OPTIONS.map((c) => ({ value: c.id, label: c.label }));

  return (
    <DsScreen scene="complete">
      <BackPill to="/profile/friends" label="Back to friends">
        Friends
      </BackPill>
      <GlassTitle title="Duels" sub={summary} />

      {error && (
        <p role="alert" className="ds-type-footnote font-bold text-ds-wrong-ink">
          {error}
        </p>
      )}

      {pending.length > 0 && (
        <>
          <Overline>Pending challenges</Overline>
          {pending.map((d) => (
            <DsCard key={d.duelId}>
              <div className="flex items-center gap-2.5">
                <Icon name="high_voltage" />
                <div className="min-w-0 flex-1">
                  <p className="ds-type-headline text-ds-ink">
                    Challenge from a friend ({d.course})
                  </p>
                  <p className="ds-type-caption text-ds-ink-soft">Accept to start now</p>
                </div>
              </div>
              <div className="flex gap-2">
                <DsButton small className="flex-1" onClick={() => handleRespond(d.duelId, true)}>
                  Accept
                </DsButton>
                <DsButton
                  small
                  variant="secondary"
                  className="flex-1"
                  onClick={() => handleRespond(d.duelId, false)}
                >
                  Decline
                </DsButton>
              </div>
            </DsCard>
          ))}
        </>
      )}

      <Overline>Active duels</Overline>
      {loadingDuels ? (
        <DsCard>
          <p className="ds-type-footnote text-ds-ink-soft">Loading…</p>
        </DsCard>
      ) : active.length === 0 ? (
        <DsCard>
          <p className="ds-type-footnote text-ds-ink-soft">No active duels right now.</p>
        </DsCard>
      ) : (
        active.map((d) => {
          const mine = d.challengerId === myId;
          const myGain =
            (mine ? d.challengerXpNow : d.opponentXpNow) -
            (mine ? d.challengerXpStart : d.opponentXpStart);
          const theirGain =
            (mine ? d.opponentXpNow : d.challengerXpNow) -
            (mine ? d.opponentXpStart : d.challengerXpStart);
          return (
            <DsCard key={d.duelId}>
              <div className="flex items-center gap-2">
                <DsPill>{d.course}</DsPill>
                <span className="ds-type-caption text-ds-ink-soft">
                  ends {d.endsAt ? new Date(d.endsAt).toLocaleDateString() : "soon"}
                </span>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <p className="ds-type-caption text-ds-ink-soft">You</p>
                  <p className="tnum ds-type-display text-ds-choice">+{myGain}</p>
                </div>
                <div className="text-right">
                  <p className="ds-type-caption text-ds-ink-soft">Them</p>
                  <p className="tnum ds-type-display text-ds-ink-soft">+{theirGain}</p>
                </div>
              </div>
              <DsBar
                value={duelShare(myGain, theirGain)}
                label="Your share of the XP"
                tone="choice"
                tall
              />
              <p className="tnum ds-type-footnote text-ds-ink-soft">
                <span>You: +{myGain}</span>
                <span aria-hidden="true"> · </span>
                <span>Them: +{theirGain}</span>
              </p>
            </DsCard>
          );
        })
      )}

      <Overline>Challenge a friend</Overline>
      <DsCard>
        <p id="duel-friend-label" className="ds-type-caption text-ds-ink-soft">
          Friend
        </p>
        {(friends ?? []).length === 0 ? (
          <p className="ds-type-footnote text-ds-ink-soft">
            No friends yet. Share your invite link to get started.
          </p>
        ) : (
          <div
            role="radiogroup"
            aria-labelledby="duel-friend-label"
            className="flex gap-2 overflow-x-auto pb-1"
          >
            {(friends ?? []).map((f) => (
              <DsChip
                key={f.userId}
                radio
                on={challengeFriendId === f.userId}
                onClick={() => setChallengeFriendId(f.userId)}
              >
                <ProfileAvatar seed={f.avatarSeed} name={f.displayName} className="size-6" />
                {f.displayName}
              </DsChip>
            ))}
          </div>
        )}
        <p className="ds-type-caption text-ds-ink-soft">Course</p>
        <DsSegmented
          ariaLabel="Course for the challenge"
          value={challengeCourse}
          onChange={setChallengeCourse}
          options={courseOptions}
        />
        <DsButton full onClick={handleChallengeFriend} disabled={!challengeFriendId}>
          Send challenge
        </DsButton>
      </DsCard>

      <Overline>Open duel</Overline>
      <DsCard>
        <p className="ds-type-footnote text-ds-ink-soft">
          Get matched with another learner at your level.
        </p>
        <DsSegmented
          ariaLabel="Course for the open duel"
          value={openCourse}
          onChange={setOpenCourse}
          options={courseOptions}
        />
        <div className="flex items-center gap-2.5">
          <span className="ds-type-headline min-w-0 flex-1 text-ds-ink">
            Match me with someone at my level
          </span>
          <DsSwitch
            on={matchByLevel}
            onChange={setMatchByLevel}
            label="Match me with someone at my level"
          />
        </div>
        {waitingInQueue ? (
          <div className="flex items-center gap-2.5">
            <span className="ds-type-footnote min-w-0 flex-1 text-ds-ink-soft">
              Waiting for an opponent…
            </span>
            <DsButton small variant="secondary" onClick={handleLeaveQueue}>
              Cancel
            </DsButton>
          </div>
        ) : (
          <DsButton full onClick={handleJoinOpenQueue} disabled={queueing}>
            {queueing ? "Finding a match…" : "Find an open duel"}
          </DsButton>
        )}
      </DsCard>

      {finished.length > 0 && (
        <>
          <Overline>Past duels</Overline>
          <DsCard flush>
            {finished.map((d, i) => {
              const r = duelResult(d.status, d.winnerId, myId);
              return (
                <DsRow key={d.duelId} first={i === 0}>
                  <span className="ds-type-headline min-w-0 flex-1 text-ds-ink">{d.course}</span>
                  <DsPill
                    tone={r.tone === "won" ? "right" : r.tone === "lost" ? "wrong" : "neutral"}
                  >
                    {r.label}
                  </DsPill>
                </DsRow>
              );
            })}
          </DsCard>
        </>
      )}
    </DsScreen>
  );
}
