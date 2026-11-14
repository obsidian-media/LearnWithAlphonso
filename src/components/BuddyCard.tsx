import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LEARNER_PROFILE_KEY, parseLearnerProfile } from "@/lib/learner-profile";
import {
  BUDDY_COPY,
  BUDDY_PRESETS,
  buddyMessageLine,
  buddyEndConfirm,
  buddyFindButton,
  buddyWaitingLine,
  buddyGraceLine,
  buddyIncomingLine,
  buddyOutgoingLine,
  buddyBlockConfirm,
  buddyBlockedLine,
  buddyCanSendPresets,
  buddySafetyMenuLabel,
  buddyStatusMessage,
  buddyStreakLine,
  buddyWeekLine,
  needsAgeConfirmation,
} from "../lib/buddy";
import {
  cancelBuddyRequest,
  endBuddy,
  joinBuddyPool,
  leaveBuddyPool,
  getBuddyMessages,
  getBuddyPool,
  getBuddyRequests,
  getMyBuddy,
  requestBuddy,
  respondBuddyRequest,
  sendBuddyMessage,
  type BuddyActionResult,
  type MyBuddy,
} from "../lib/buddy.functions";
import { DsSwitch, dsButtonClass } from "@/components/ds/Blocks";
import { SocialSafetyMenu } from "./SocialSafetyMenu";

// A failed lookup is shown as a failure with a retry, never as "no buddy" (retry: false so that state appears at once,
// the same lesson as the Teams screens in PR #237).
function useBuddyQueries() {
  const buddy = useQuery({ queryKey: ["myBuddy"], queryFn: () => getMyBuddy(), retry: false });
  const requests = useQuery({
    queryKey: ["buddyRequests"],
    queryFn: () => getBuddyRequests(),
    retry: false,
  });
  // Polled while the Friends page is open (no realtime socket, spec Part 3); only asked for while paired.
  const messages = useQuery({
    // Keyed by the pair: after a new pairing, the previous pair's cached messages (or error) can never show under the
    // new buddy's name.
    queryKey: ["buddyMessages", buddy.data?.pairId ?? null],
    queryFn: () => getBuddyMessages(),
    retry: false,
    refetchInterval: 60_000,
    enabled: !!buddy.data,
  });
  // Opt-in matching (Phase 3b): whether it is switched on, whether the learner is waiting, and their courses.
  const pool = useQuery({ queryKey: ["buddyPool"], queryFn: () => getBuddyPool(), retry: false });
  return { buddy, requests, messages, pool };
}

type BuddyQueries = ReturnType<typeof useBuddyQueries>;

// When the two queries last changed (data or error). An answer is shown only until they change again, so it never
// outlives the state it described (a cancelled request, a pair the other side ended).
// The messages query is part of the stamp only for a sent message: pairing turns that query on, and its first load must
// not hide "You're study buddies now.".
function stampOf(q: BuddyQueries, withMessages: boolean) {
  const parts = [q.buddy, q.requests, q.pool, ...(withMessages ? [q.messages] : [])];
  return parts.flatMap((s) => [s.dataUpdatedAt, s.errorUpdatedAt]).join(":");
}

/** Runs a buddy action, keeps its answer as fixed wording, and refreshes everything the answer can change. */
function useBuddyAction(queries: BuddyQueries) {
  const queryClient = useQueryClient();
  const [answer, setAnswer] = useState<{
    text: string;
    stamp: string;
    withMessages: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<BuddyActionResult>, withMessages = false) {
    setBusy(true);
    let text: string;
    try {
      text = buddyStatusMessage((await action()).status);
    } catch {
      text = buddyStatusMessage("unknown");
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["myBuddy"] }),
      queryClient.invalidateQueries({ queryKey: ["buddyRequests"] }),
      queryClient.invalidateQueries({ queryKey: ["buddyMessages"] }),
      queryClient.invalidateQueries({ queryKey: ["buddyPool"] }),
    ]);
    // Stamp with the state AFTER the refresh this action caused; busy stays on until then, so a second click
    // cannot act on a request that is already gone.
    const state = (key: string) => queryClient.getQueryState([key]);
    const b = state("myBuddy");
    const r = state("buddyRequests");
    const pl = state("buddyPool");
    const pairId = queryClient.getQueryData<MyBuddy>(["myBuddy"])?.pairId ?? null;
    const m = queryClient.getQueryState(["buddyMessages", pairId]);
    // A query with no cache entry yet (messages before the first pairing) reads 0, matching what the hook reports.
    const parts = [b, r, pl, ...(withMessages ? [m] : [])];
    setAnswer({
      text,
      stamp: parts.flatMap((s) => [s?.dataUpdatedAt ?? 0, s?.errorUpdatedAt ?? 0]).join(":"),
      withMessages,
    });
    setBusy(false);
  }
  const message =
    answer && answer.stamp === stampOf(queries, answer.withMessages) ? answer.text : null;
  return { message, busy, run };
}

const card = "rounded-[22px] border-2 border-ds-line bg-ds-card p-3.5";
const smallBtn = dsButtonClass("secondary", { small: true });
const smallPrimary = dsButtonClass("primary", { small: true });
const smallDanger = dsButtonClass("danger", { small: true });
const findBtn = (first: boolean) => dsButtonClass(first ? "primary" : "secondary", { full: true });

/** The Friends page's study buddy card: the current buddy's week, or pending requests and how to ask. */
export function BuddyCard() {
  const queries = useBuddyQueries();
  const { buddy, requests, messages, pool } = queries;
  const { message, busy, run } = useBuddyAction(queries);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  // After blocking a matched buddy the pair is gone; say so on the card that replaces it.
  const [blockedNotice, setBlockedNotice] = useState<string | null>(null);
  const act = (...args: Parameters<typeof run>) => {
    setBlockedNotice(null);
    return run(...args);
  };
  // Matching needs a declared-age confirmation (owner decision 2026-10-07: minimum age 13); the server refuses without it.
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  // Already answered in the first run: do not ask again (the gate stays for anyone without an age band).
  const knownAge = useQuery({
    queryKey: ["learner-profile-age"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return parseLearnerProfile(data.user?.user_metadata?.[LEARNER_PROFILE_KEY]).ageRange ?? null;
    },
    staleTime: 5 * 60_000,
  });
  const askAge = needsAgeConfirmation(knownAge.data);

  if (buddy.isLoading || requests.isLoading) {
    return (
      <div className={card}>
        <p className="ds-type-footnote text-ds-ink-soft">Loading your study buddy…</p>
      </div>
    );
  }
  // A messages failure only counts while paired (after the pair ends that query is off and must not pin the error).
  if (
    buddy.isError ||
    requests.isError ||
    (messages.isError && !!buddy.data) ||
    (pool.isError && !buddy.data)
  ) {
    return (
      <div className={card}>
        <p className="ds-type-footnote text-ds-ink-soft">{BUDDY_COPY.loadFailed}</p>
        <button
          type="button"
          onClick={() => {
            void buddy.refetch();
            void requests.refetch();
            if (buddy.data) void messages.refetch();
            else void pool.refetch();
          }}
          className={`mt-3 ${smallBtn}`}
        >
          Try again
        </button>
      </div>
    );
  }

  const mine = buddy.data;
  const pending = requests.data ?? [];
  const status = message && (
    <p role="status" className="mt-2 ds-type-caption text-ds-ink-soft">
      {message}
    </p>
  );

  if (mine) {
    return (
      <div className={card}>
        <p className="ds-type-overline text-ds-xp-text">Study buddy</p>
        <div className="mt-1 flex items-center gap-2">
          <p className="ds-type-headline text-ds-ink">{mine.buddyName}</p>
          {mine.isMatch && (
            <>
              <span className="ds-type-caption text-ds-ink-soft">{BUDDY_COPY.matchedLabel}</span>
              {/* A matched buddy is not a friend: block and report live right here (guideline 1.2). Blocking ends
                  the pair on the server (trigger), so refresh after it. */}
              <span className="ml-auto">
                <SocialSafetyMenu
                  userId={mine.buddyId}
                  displayName={mine.buddyName}
                  blockTitle={buddyBlockConfirm(mine.buddyName)}
                  menuLabel={buddySafetyMenuLabel(mine.buddyName)}
                  onBlocked={() => {
                    setBlockedNotice(buddyBlockedLine(mine.buddyName));
                    void buddy.refetch();
                  }}
                />
              </span>
            </>
          )}
        </div>
        <p className="mt-2 ds-type-footnote text-ds-ink">
          {buddyWeekLine(mine.myCount, mine.buddyCount, mine.goal)}
        </p>
        <p className="mt-1 ds-type-caption text-ds-ink-soft">{buddyStreakLine(mine.streakWeeks)}</p>
        <p className="ds-type-caption text-ds-ink-soft">{buddyGraceLine(mine.graceAvailable)}</p>
        {buddyCanSendPresets(mine) ? (
          <div role="group" aria-label={`Send ${mine.buddyName} a message`} className="mt-3">
            <p className="ds-type-caption font-semibold text-ds-ink-soft">
              Send {mine.buddyName} a message
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {BUDDY_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={busy}
                  onClick={() => act(() => sendBuddyMessage({ data: { presetId: p.id } }), true)}
                  className="inline-flex min-h-9 items-center rounded-[12px] border-2 border-ds-line bg-ds-card px-3 ds-type-caption font-extrabold text-ds-brand disabled:opacity-50"
                >
                  {p.text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-3 ds-type-caption text-ds-ink-soft">
            {buddyStatusMessage("matching_paused")}
          </p>
        )}
        {(messages.data ?? []).length > 0 && (
          <ul className="mt-3 space-y-0.5" aria-label="Recent messages">
            {(messages.data ?? [])
              .slice(-10)
              .map((msg) => ({
                msg,
                line: buddyMessageLine(msg.isMine, mine.buddyName, msg.presetId),
              }))
              .filter((x): x is { msg: (typeof x)["msg"]; line: string } => x.line !== null)
              .map(({ msg, line }) => (
                <li key={msg.messageId} className="ds-type-caption text-ds-ink">
                  {line}
                </li>
              ))}
          </ul>
        )}
        {confirmingEnd ? (
          <div className="mt-3">
            <p className="ds-type-caption text-ds-ink">{buddyEndConfirm(mine.buddyName)}</p>
            <div className="mt-2 flex gap-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmingEnd(false)}
                className={`${smallBtn}`}
              >
                Keep
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => act(() => endBuddy()).then(() => setConfirmingEnd(false))}
                className={`${smallDanger}`}
              >
                Yes, end
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingEnd(true)}
            className={`mt-3 ${smallBtn}`}
          >
            End study buddy
          </button>
        )}
        {status}
      </div>
    );
  }

  return (
    <div className={card}>
      <p className="ds-type-headline text-ds-ink">Study buddy</p>
      {blockedNotice && (
        <p role="status" className="mt-2 ds-type-caption text-ds-ink-soft">
          {blockedNotice}
        </p>
      )}
      <p className="mt-1 ds-type-caption text-ds-ink-soft">{BUDDY_COPY.intro}</p>
      {pending.map((r) =>
        r.direction === "incoming" ? (
          <div key={r.requestId} className="mt-3">
            <p className="ds-type-footnote text-ds-ink">{buddyIncomingLine(r.otherName)}</p>
            <div className="mt-1 flex gap-4">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  act(() => respondBuddyRequest({ data: { requestId: r.requestId, accept: true } }))
                }
                className={`${smallPrimary}`}
              >
                Accept
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  act(() =>
                    respondBuddyRequest({ data: { requestId: r.requestId, accept: false } }),
                  )
                }
                className={`${smallBtn}`}
              >
                Decline
              </button>
            </div>
          </div>
        ) : (
          <div key={r.requestId} className="mt-3 flex items-center gap-4">
            <p className="ds-type-footnote text-ds-ink">{buddyOutgoingLine(r.otherName)}</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => cancelBuddyRequest({ data: { requestId: r.requestId } }))}
              className={`${smallBtn}`}
            >
              Cancel request
            </button>
          </div>
        ),
      )}
      {/* A waiting learner can always stop looking, even while matching is switched off (consent is theirs);
          only the Find buttons depend on the switch. */}
      {pool.data &&
        (pool.data.waiting && pool.data.course ? (
          <div className="mt-3 flex items-center gap-4">
            <p className="ds-type-footnote text-ds-ink">{buddyWaitingLine(pool.data.course)}</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => leaveBuddyPool())}
              className={`${smallBtn}`}
            >
              {BUDDY_COPY.stopLooking}
            </button>
          </div>
        ) : (
          pool.data.matchingEnabled &&
          pool.data.courses.length > 0 && (
            <div className="mt-3">
              <p className="ds-type-caption text-ds-ink-soft">{BUDDY_COPY.poolIntro}</p>
              {askAge && (
                <div className="mt-2 flex items-center gap-2.5">
                  <span className="ds-type-headline min-w-0 flex-1 text-ds-ink">
                    {BUDDY_COPY.ageConfirm}
                  </span>
                  <DsSwitch
                    on={ageConfirmed}
                    onChange={setAgeConfirmed}
                    label={BUDDY_COPY.ageConfirm}
                  />
                </div>
              )}
              <div className="mt-2 grid gap-2">
                {pool.data.courses.map((course, i) => (
                  <button
                    key={course}
                    type="button"
                    disabled={busy || knownAge.isLoading || (askAge && !ageConfirmed)}
                    onClick={() =>
                      act(() =>
                        joinBuddyPool({
                          data: {
                            course: course as "en" | "fr" | "es",
                            ageConfirmed: askAge ? ageConfirmed : true,
                          },
                        }),
                      )
                    }
                    className={findBtn(i === 0)}
                  >
                    {buddyFindButton(course)}
                  </button>
                ))}
              </div>
            </div>
          )
        ))}
      {status}
    </div>
  );
}

/** On a friend's row: ask them to be your study buddy. Hidden when it could only fail or is already done. */
export function AskBuddyButton({ friendId }: { friendId: string }) {
  const queries = useBuddyQueries();
  const { buddy, requests } = queries;
  const { message, busy, run } = useBuddyAction(queries);

  const eligible =
    buddy.isSuccess &&
    requests.isSuccess &&
    buddy.data === null &&
    !(requests.data ?? []).some((r) => r.otherId === friendId);

  // The answer and the button are independent: a sent request hides the button but keeps "Request sent"; a failed
  // one keeps the button so the friend can be asked again.
  if (!message && !eligible) return null;
  return (
    <>
      {message && <p className="mt-0.5 ds-type-caption text-ds-ink-soft">{message}</p>}
      {eligible && (
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => requestBuddy({ data: { friendId } }))}
          className={`mt-0.5 ${smallPrimary}`}
        >
          Ask to be study buddy
        </button>
      )}
    </>
  );
}
