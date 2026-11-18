import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ProfileAvatar } from "@/components/ds/ProfileAvatar";
import {
  BackPill,
  DsBar,
  DsButton,
  DsCard,
  DsChip,
  DsEmptyState,
  DsPill,
  DsRow,
  DsSegmented,
  DsSwitch,
  GlassTitle,
  Icon,
  Overline,
} from "@/components/ds/Blocks";
import { DsScreen } from "@/components/ds/DsScreen";
import { RefreshError } from "@/components/ds/RefreshError";
import { SocialSafetyMenu } from "../../components/SocialSafetyMenu";
import { getMyDuels, createDuel, respondToDuel, getFriends } from "../../lib/friends.functions";
import { getMyProfile } from "../../lib/leaderboard.functions";
import {
  getMyDuelQueue,
  joinOpenDuelQueue,
  leaveOpenDuelQueue,
} from "../../lib/challenges.functions";
import { socialFailureMessage, socialReasonMessage } from "../../lib/social-reason-copy";
import { duelResult, duelShare, duelsSummary } from "../../lib/social-presentation";
import { useInFlight } from "../../lib/use-in-flight";

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
  const duelsQuery = useQuery({
    queryKey: ["myDuels"],
    queryFn: () => getMyDuels(),
    retry: false,
  });
  const { data: duels, isLoading: loadingDuels } = duelsQuery;
  const friendsQuery = useQuery({
    queryKey: ["friends"],
    queryFn: () => getFriends(),
    retry: false,
  });
  const friends = friendsQuery.data;
  // The server keeps the learner queued after they leave this page: on load, show what it says. A failed read falls
  // back to "Find an open duel" on purpose: joining again is safe (the server updates the one queue row), while
  // inventing a wait could leave the learner waiting on nothing. Until the read settles, the button is held back.
  const queueQuery = useQuery({
    queryKey: ["myDuelQueue"],
    queryFn: () => getMyDuelQueue(),
    retry: false,
  });

  const [challengeFriendId, setChallengeFriendId] = useState("");
  const [challengeCourse, setChallengeCourse] = useState<"en" | "fr" | "es">("en");
  const [openCourse, setOpenCourse] = useState<"en" | "fr" | "es">("en");
  const [matchByLevel, setMatchByLevel] = useState(true);
  const [queueing, setQueueing] = useState(false);
  const [waitingInQueue, setWaitingInQueue] = useState(false);
  const [leavingQueue, setLeavingQueue] = useState(false);
  // The server let nobody in: open duels are switched off, or this account is kept out of contact with strangers.
  const [openDuelsUnavailable, setOpenDuelsUnavailable] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Synchronous guards: a second click can land before the state above re-renders the buttons disabled.
  const respondFlight = useInFlight();
  const challengeFlight = useInFlight();
  const queueFlight = useInFlight();
  // Once the learner has joined or left, their own action is the truth: a queue read that answers later describes
  // the moment before it and must not flip the card back.
  const actedOnQueue = useRef(false);

  useEffect(() => {
    const queue = queueQuery.data;
    if (!queue || actedOnQueue.current) return;
    setWaitingInQueue(queue.queued);
    if (!queue.queued) return;
    const course = COURSE_OPTIONS.find((c) => c.id === queue.course);
    if (course) setOpenCourse(course.id);
  }, [queueQuery.data]);

  const myId = me?.id;
  const pending = (duels ?? []).filter((d) => d.status === "pending" && d.opponentId === myId);
  const active = (duels ?? []).filter((d) => d.status === "active");
  const finished = (duels ?? []).filter((d) => d.status === "completed" || d.status === "declined");

  /**
   * The block and report menu for the other person in a duel. A duel row carries no name, only ids, so the menu says
   * "this opponent" (as DuelsView.swift and DuelsScreen.kt do) and acts on whichever id is not the learner's.
   * Past duels with a blocked opponent stay as they are; a block only stops new contact.
   */
  function opponentMenu(d: { challengerId: string; opponentId: string }) {
    if (!myId) return null;
    return (
      <SocialSafetyMenu
        userId={d.challengerId === myId ? d.opponentId : d.challengerId}
        displayName="this opponent"
        blockTitle="Block this opponent?"
        menuLabel="Block or report your opponent"
        onBlocked={() => void refetchDuels()}
      />
    );
  }

  async function refetchDuels() {
    await queryClient.invalidateQueries({ queryKey: ["myDuels"] });
  }

  async function handleRespond(duelId: string, accept: boolean) {
    // One answer per duel: a second click would answer an already-answered duel and read back as "not found".
    if (!respondFlight.begin()) return;
    setRespondingId(duelId);
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
    } finally {
      respondFlight.end();
      setRespondingId(null);
    }
  }

  async function handleChallengeFriend() {
    if (!challengeFriendId || !challengeFlight.begin()) return;
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
    } finally {
      challengeFlight.end();
    }
  }

  /** Record what the learner's own join or leave did, so a slower load-time read cannot overwrite it. */
  async function settleQueue(queued: boolean) {
    actedOnQueue.current = true;
    await queryClient.cancelQueries({ queryKey: ["myDuelQueue"] });
    queryClient.setQueryData(
      ["myDuelQueue"],
      queued
        ? { queued: true, course: openCourse, queuedAt: new Date().toISOString() }
        : { queued: false },
    );
    setWaitingInQueue(queued);
  }

  async function handleJoinOpenQueue() {
    if (!queueFlight.begin()) return;
    setQueueing(true);
    setError(null);
    setOpenDuelsUnavailable(false);
    try {
      const result = await joinOpenDuelQueue({ data: { course: openCourse, matchByLevel } });
      if (result.matched) {
        await settleQueue(false);
        await refetchDuels();
      } else if (result.queued) {
        await settleQueue(true);
      } else {
        // Not matched and not queued: the server did not let this learner in. Waiting would wait forever.
        await settleQueue(false);
        setOpenDuelsUnavailable(true);
      }
    } catch (e) {
      setError(socialFailureMessage(e));
    } finally {
      queueFlight.end();
      setQueueing(false);
    }
  }

  async function handleLeaveQueue() {
    if (!queueFlight.begin()) return;
    setLeavingQueue(true);
    setError(null);
    try {
      await leaveOpenDuelQueue();
      await settleQueue(false);
    } catch (e) {
      // Still queued on the server: keep showing the wait, with Leave queue to try again.
      setError(socialFailureMessage(e));
    } finally {
      queueFlight.end();
      setLeavingQueue(false);
    }
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
                {opponentMenu(d)}
              </div>
              <div className="flex gap-2">
                <DsButton
                  small
                  className="flex-1"
                  aria-label={`Accept the ${d.course} challenge`}
                  onClick={() => void handleRespond(d.duelId, true)}
                  disabled={respondingId !== null}
                >
                  Accept
                </DsButton>
                <DsButton
                  small
                  variant="secondary"
                  className="flex-1"
                  aria-label={`Decline the ${d.course} challenge`}
                  onClick={() => void handleRespond(d.duelId, false)}
                  disabled={respondingId !== null}
                >
                  Decline
                </DsButton>
              </div>
            </DsCard>
          ))}
        </>
      )}

      <Overline>Active duels</Overline>
      {duelsQuery.isError && duels && (
        <RefreshError what="your duels" onRetry={() => void duelsQuery.refetch()} />
      )}
      {loadingDuels ? (
        <DsCard>
          <p className="ds-type-footnote text-ds-ink-soft">Loading…</p>
        </DsCard>
      ) : duelsQuery.isError && !duels ? (
        <DsEmptyState
          tone="error"
          art="/mascots/alphonso-encouraging.png"
          title="Couldn't load your duels."
          message="Check your connection and try again."
        >
          <DsButton small variant="secondary" onClick={() => void duelsQuery.refetch()}>
            Try again
          </DsButton>
        </DsEmptyState>
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
                <span className="ml-auto">{opponentMenu(d)}</span>
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
        {friendsQuery.isError && friends && (
          <RefreshError what="your friends" onRetry={() => void friendsQuery.refetch()} />
        )}
        {friendsQuery.isError && !friends ? (
          <div role="alert" className="grid gap-2">
            <p className="ds-type-footnote text-ds-ink-soft">Couldn't load your friends.</p>
            <DsButton small variant="secondary" onClick={() => void friendsQuery.refetch()}>
              Try again
            </DsButton>
          </div>
        ) : friendsQuery.isLoading ? (
          <p className="ds-type-footnote text-ds-ink-soft">Loading…</p>
        ) : (friends ?? []).length === 0 ? (
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
            <DsButton
              small
              variant="secondary"
              onClick={() => void handleLeaveQueue()}
              disabled={leavingQueue}
            >
              {leavingQueue ? "Leaving…" : "Leave queue"}
            </DsButton>
          </div>
        ) : (
          <>
            {openDuelsUnavailable && (
              <p role="status" className="ds-type-footnote text-ds-ink-soft">
                Open duels aren't available right now. You can still challenge a friend.
              </p>
            )}
            <DsButton
              full
              onClick={() => void handleJoinOpenQueue()}
              disabled={queueing || queueQuery.isLoading}
            >
              {queueQuery.isLoading
                ? "Checking the queue…"
                : queueing
                  ? "Finding a match…"
                  : "Find an open duel"}
            </DsButton>
          </>
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
