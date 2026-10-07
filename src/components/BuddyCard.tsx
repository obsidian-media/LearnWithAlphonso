import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { buddyStatusMessage, buddyWeekLine } from "../lib/buddy";
import {
  cancelBuddyRequest,
  endBuddy,
  getBuddyRequests,
  getMyBuddy,
  requestBuddy,
  respondBuddyRequest,
  type BuddyActionResult,
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
  return { buddy, requests };
}

type BuddyQueries = ReturnType<typeof useBuddyQueries>;

// When the two queries last changed (data or error). An answer is shown only until they change again, so it never
// outlives the state it described (a cancelled request, a pair the other side ended).
function stampOf(q: BuddyQueries) {
  return [
    q.buddy.dataUpdatedAt,
    q.buddy.errorUpdatedAt,
    q.requests.dataUpdatedAt,
    q.requests.errorUpdatedAt,
  ].join(":");
}

/** Runs a buddy action, keeps its answer as fixed wording, and refreshes everything the answer can change. */
function useBuddyAction(queries: BuddyQueries) {
  const queryClient = useQueryClient();
  const [answer, setAnswer] = useState<{ text: string; stamp: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<BuddyActionResult>) {
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
    ]);
    // Stamp with the state AFTER the refresh this action caused; busy stays on until then, so a second click
    // cannot act on a request that is already gone.
    const state = (key: string) => queryClient.getQueryState([key]);
    const b = state("myBuddy");
    const r = state("buddyRequests");
    setAnswer({
      text,
      stamp: [b?.dataUpdatedAt, b?.errorUpdatedAt, r?.dataUpdatedAt, r?.errorUpdatedAt].join(":"),
    });
    setBusy(false);
  }
  const message = answer && answer.stamp === stampOf(queries) ? answer.text : null;
  return { message, busy, run };
}

const card = "rounded-2xl border border-hairline bg-parchment p-4";
const linkButton = "text-xs font-semibold underline underline-offset-4 disabled:opacity-50";

/** The Friends page's study buddy card: the current buddy's week, or pending requests and how to ask. */
export function BuddyCard() {
  const queries = useBuddyQueries();
  const { buddy, requests } = queries;
  const { message, busy, run } = useBuddyAction(queries);
  const [confirmingEnd, setConfirmingEnd] = useState(false);

  if (buddy.isLoading || requests.isLoading) {
    return (
      <div className={card}>
        <p className="text-sm text-ink-soft">Loading your study buddy…</p>
      </div>
    );
  }
  if (buddy.isError || requests.isError) {
    return (
      <div className={card}>
        <p className="text-sm text-ink-soft">Couldn't load your study buddy.</p>
        <button
          type="button"
          onClick={() => {
            void buddy.refetch();
            void requests.refetch();
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
        <p className="mt-1 text-xs text-ink-soft">
          Streak: {mine.streakWeeks} week{mine.streakWeeks === 1 ? "" : "s"}
        </p>
        <p className="text-xs text-ink-soft">
          {mine.graceAvailable ? "1 grace week left" : "No grace week left"}
        </p>
        {confirmingEnd ? (
          <div className="mt-3">
            <p className="text-xs text-ink">
              End being study buddies with {mine.buddyName}? Your streak ends.
            </p>
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
      <p className="mt-1 text-xs text-ink-soft/80">
        Pick a friend to study with. Each week you both aim for 3 lessons and keep a streak
        together.
      </p>
      {pending.map((r) =>
        r.direction === "incoming" ? (
          <div key={r.requestId} className="mt-3">
            <p className="text-sm text-ink">{r.otherName} wants to be your study buddy.</p>
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
            <p className="text-sm text-ink">Waiting for {r.otherName}.</p>
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
