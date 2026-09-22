import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MobileFrame } from "../../components/AppShell";
import { getMyDuels, createDuel, respondToDuel, getFriends } from "../../lib/friends.functions";
import { getMyProfile } from "../../lib/leaderboard.functions";
import { joinOpenDuelQueue, leaveOpenDuelQueue } from "../../lib/challenges.functions";

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
    const result = await respondToDuel({ data: { duelId, accept } });
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    await refetchDuels();
  }

  async function handleChallengeFriend() {
    if (!challengeFriendId) return;
    setError(null);
    const result = await createDuel({
      data: { opponentId: challengeFriendId, course: challengeCourse },
    });
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setChallengeFriendId("");
    await refetchDuels();
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

  return (
    <MobileFrame>
      <div className="px-6 pb-12 pt-6">
        <div className="flex items-center gap-3">
          <Link to="/profile/friends" aria-label="Back to friends" className="text-ink-soft/70">
            ←
          </Link>
          <h1 className="font-display text-[22px] font-semibold text-ink">Duels</h1>
        </div>

        {error && <p className="mt-3 text-xs text-rose-500">{error}</p>}

        {pending.length > 0 && (
          <div className="mt-6">
            <h2 className="font-display text-[16px] font-semibold text-ink">Pending challenges</h2>
            <div className="mt-2 space-y-2">
              {pending.map((d) => (
                <div
                  key={d.duelId}
                  className="flex items-center justify-between rounded-2xl border border-hairline bg-surface p-3.5"
                >
                  <span className="text-sm text-ink">Challenge from a friend ({d.course})</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleRespond(d.duelId, true)}
                      className="rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-surface"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRespond(d.duelId, false)}
                      className="rounded-full border border-hairline px-3 py-1.5 text-xs font-semibold text-ink-soft"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6">
          <h2 className="font-display text-[16px] font-semibold text-ink">Active duels</h2>
          {loadingDuels ? (
            <p className="mt-2 text-sm text-ink-soft">Loading…</p>
          ) : active.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">No active duels right now.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {active.map((d) => {
                const myXpNow = d.challengerId === myId ? d.challengerXpNow : d.opponentXpNow;
                const myXpStart = d.challengerId === myId ? d.challengerXpStart : d.opponentXpStart;
                const oppXpNow = d.challengerId === myId ? d.opponentXpNow : d.challengerXpNow;
                const oppXpStart =
                  d.challengerId === myId ? d.opponentXpStart : d.challengerXpStart;
                return (
                  <div
                    key={d.duelId}
                    className="rounded-2xl border border-hairline bg-surface p-3.5"
                  >
                    <p className="text-xs text-ink-soft">
                      {d.course} · ends{" "}
                      {d.endsAt ? new Date(d.endsAt).toLocaleDateString() : "soon"}
                    </p>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="tnum text-sm font-semibold text-ink">
                        You: +{myXpNow - myXpStart}
                      </span>
                      <span className="tnum text-sm text-ink-soft">
                        Them: +{oppXpNow - oppXpStart}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-8 space-y-3 rounded-2xl border border-hairline bg-parchment p-4">
          <p className="font-display text-sm font-semibold text-ink">Challenge a friend</p>
          <select
            value={challengeFriendId}
            onChange={(e) => setChallengeFriendId(e.target.value)}
            className="w-full rounded-xl border border-hairline bg-surface px-3 py-2 text-sm"
          >
            <option value="">Choose a friend…</option>
            {(friends ?? []).map((f) => (
              <option key={f.userId} value={f.userId}>
                {f.displayName}
              </option>
            ))}
          </select>
          <select
            value={challengeCourse}
            onChange={(e) => setChallengeCourse(e.target.value as "en" | "fr" | "es")}
            className="w-full rounded-xl border border-hairline bg-surface px-3 py-2 text-sm"
          >
            {COURSE_OPTIONS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleChallengeFriend}
            disabled={!challengeFriendId}
            className="w-full rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-surface disabled:opacity-50"
          >
            Send challenge
          </button>
        </div>

        <div className="mt-4 space-y-3 rounded-2xl border border-hairline bg-parchment p-4">
          <p className="font-display text-sm font-semibold text-ink">Open duel</p>
          <p className="text-xs text-ink-soft/80">
            Get matched with another learner at your level.
          </p>
          <select
            value={openCourse}
            onChange={(e) => setOpenCourse(e.target.value as "en" | "fr" | "es")}
            className="w-full rounded-xl border border-hairline bg-surface px-3 py-2 text-sm"
          >
            {COURSE_OPTIONS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-xs text-ink-soft">
            <input
              type="checkbox"
              checked={matchByLevel}
              onChange={(e) => setMatchByLevel(e.target.checked)}
            />
            Match me with someone at my level
          </label>
          {waitingInQueue ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-soft">Waiting for an opponent…</span>
              <button
                type="button"
                onClick={handleLeaveQueue}
                className="text-xs font-medium text-rose-500 underline underline-offset-4"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleJoinOpenQueue}
              disabled={queueing}
              className="w-full rounded-full border border-hairline px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-50"
            >
              {queueing ? "Finding a match…" : "Find an open duel"}
            </button>
          )}
        </div>

        {finished.length > 0 && (
          <div className="mt-8">
            <h2 className="font-display text-[16px] font-semibold text-ink">Past duels</h2>
            <div className="mt-2 space-y-2">
              {finished.map((d) => (
                <div
                  key={d.duelId}
                  className="flex items-center justify-between rounded-2xl border border-hairline bg-surface p-3.5 text-sm text-ink-soft"
                >
                  <span>{d.course}</span>
                  <span>
                    {d.status === "declined"
                      ? "Declined"
                      : d.winnerId === myId
                        ? "You won"
                        : d.winnerId
                          ? "You lost"
                          : "Tied"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </MobileFrame>
  );
}
