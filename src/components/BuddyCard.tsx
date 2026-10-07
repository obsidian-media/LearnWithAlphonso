import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  BUDDY_COPY,
  BUDDY_PRESETS,
  buddyMessageLine,
  buddyEndConfirm,
  buddyGraceLine,
  buddyIncomingLine,
  buddyOutgoingLine,
  buddyStatusMessage,
  buddyStreakLine,
  buddyWeekLine,
} from "../lib/buddy";
import {
  cancelBuddyRequest,
  endBuddy,
  getBuddyMessages,
  getBuddyRequests,
  getMyBuddy,
  requestBuddy,
  respondBuddyRequest,
  sendBuddyMessage,
  type BuddyActionResult,
  type MyBuddy,
} from "../lib/buddy.functions";

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
  return { buddy, requests, messages };
}

type BuddyQueries = ReturnType<typeof useBuddyQueries>;

// When the two queries last changed (data or error). An answer is shown only until they change again, so it never
// outlives the state it described (a cancelled request, a pair the other side ended).
// The messages query is part of the stamp only for a sent message: pairing turns that query on, and its first load must
// not hide "You're study buddies now.".
function stampOf(q: BuddyQueries, withMessages: boolean) {
  const parts = [q.buddy, q.requests, ...(withMessages ? [q.messages] : [])];
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
    ]);
    // Stamp with the state AFTER the refresh this action caused; busy stays on until then, so a second click
    // cannot act on a request that is already gone.
    const state = (key: string) => queryClient.getQueryState([key]);
    const b = state("myBuddy");
    const r = state("buddyRequests");
    const pairId = queryClient.getQueryData<MyBuddy>(["myBuddy"])?.pairId ?? null;
    const m = queryClient.getQueryState(["buddyMessages", pairId]);
    // A query with no cache entry yet (messages before the first pairing) reads 0, matching what the hook reports.
    const parts = [b, r, ...(withMessages ? [m] : [])];
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

const card = "rounded-2xl border border-hairline bg-parchment p-4";
const linkButton = "text-xs font-semibold underline underline-offset-4 disabled:opacity-50";

/** The Friends page's study buddy card: the current buddy's week, or pending requests and how to ask. */
export function BuddyCard() {
  const queries = useBuddyQueries();
  const { buddy, requests, messages } = queries;
  const { message, busy, run } = useBuddyAction(queries);
  const [confirmingEnd, setConfirmingEnd] = useState(false);

  if (buddy.isLoading || requests.isLoading) {
    return (
      <div className={card}>
        <p className="text-sm text-ink-soft">Loading your study buddy…</p>
      </div>
    );
  }
  // A messages failure only counts while paired (after the pair ends that query is off and must not pin the error).
  if (buddy.isError || requests.isError || (messages.isError && !!buddy.data)) {
    return (
      <div className={card}>
        <p className="text-sm text-ink-soft">{BUDDY_COPY.loadFailed}</p>
        <button
          type="button"
          onClick={() => {
            void buddy.refetch();
            void requests.refetch();
            if (buddy.data) void messages.refetch();
          }}
          className="mt-3 rounded-full border border-hairline px-4 py-2 text-sm font-semibold text-ink"
        >
          Try again
        </button>
      </div>
    );
  }

  const mine = buddy.data;
  const pending = requests.data ?? [];
  const status = message && (
    <p role="status" className="mt-2 text-xs text-ink-soft">
      {message}
    </p>
  );

  if (mine) {
    return (
      <div className={card}>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft/80">
          Study buddy
        </p>
        <p className="mt-1 font-display text-base font-semibold text-ink">{mine.buddyName}</p>
        <p className="mt-2 text-sm text-ink">
          {buddyWeekLine(mine.myCount, mine.buddyCount, mine.goal)}
        </p>
        <p className="mt-1 text-xs text-ink-soft">{buddyStreakLine(mine.streakWeeks)}</p>
        <p className="text-xs text-ink-soft">{buddyGraceLine(mine.graceAvailable)}</p>
        <div role="group" aria-label={`Send ${mine.buddyName} a message`} className="mt-3">
          <p className="text-xs font-semibold text-ink-soft/80">Send {mine.buddyName} a message</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {BUDDY_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={busy}
                onClick={() => run(() => sendBuddyMessage({ data: { presetId: p.id } }), true)}
                className="rounded-full border border-hairline px-3 py-1 text-xs text-ink disabled:opacity-50"
              >
                {p.text}
              </button>
            ))}
          </div>
        </div>
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
                <li key={msg.messageId} className="text-xs text-ink">
                  {line}
                </li>
              ))}
          </ul>
        )}
        {confirmingEnd ? (
          <div className="mt-3">
            <p className="text-xs text-ink">{buddyEndConfirm(mine.buddyName)}</p>
            <div className="mt-2 flex gap-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmingEnd(false)}
                className={`${linkButton} text-ink-soft`}
              >
                Keep
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => endBuddy()).then(() => setConfirmingEnd(false))}
                className={`${linkButton} text-rose-500`}
              >
                Yes, end
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingEnd(true)}
            className={`mt-3 ${linkButton} text-ink-soft`}
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
      <p className="font-display text-base font-semibold text-ink">Study buddy</p>
      <p className="mt-1 text-xs text-ink-soft/80">{BUDDY_COPY.intro}</p>
      {pending.map((r) =>
        r.direction === "incoming" ? (
          <div key={r.requestId} className="mt-3">
            <p className="text-sm text-ink">{buddyIncomingLine(r.otherName)}</p>
            <div className="mt-1 flex gap-4">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(() => respondBuddyRequest({ data: { requestId: r.requestId, accept: true } }))
                }
                className={`${linkButton} text-moss`}
              >
                Accept
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    respondBuddyRequest({ data: { requestId: r.requestId, accept: false } }),
                  )
                }
                className={`${linkButton} text-ink-soft`}
              >
                Decline
              </button>
            </div>
          </div>
        ) : (
          <div key={r.requestId} className="mt-3 flex items-center gap-4">
            <p className="text-sm text-ink">{buddyOutgoingLine(r.otherName)}</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => cancelBuddyRequest({ data: { requestId: r.requestId } }))}
              className={`${linkButton} text-ink-soft`}
            >
              Cancel request
            </button>
          </div>
        ),
      )}
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
      {message && <p className="mt-0.5 text-[11px] text-ink-soft">{message}</p>}
      {eligible && (
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => requestBuddy({ data: { friendId } }))}
          className={`mt-0.5 ${linkButton} text-moss`}
        >
          Ask to be study buddy
        </button>
      )}
    </>
  );
}
