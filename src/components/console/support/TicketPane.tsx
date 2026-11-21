import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { TicketDetail, TicketMessage } from "../../../lib/staff-support.server";
import {
  CHANNEL_LABELS,
  HANDOFF_LABELS,
  TOPIC_LABELS,
  courseName,
  label,
  stampLabel,
} from "../../../lib/support-inbox-copy";
import { waitingLabel } from "../../../lib/console-format";
import { Figure } from "../Figure";
import { ReasonDialog } from "../../staff/ReasonDialog";
import { StatusPill, UrgentBadge } from "./StatusPill";
import type { Assignable, SupportApi } from "./supportApi";

/** Canned openings the staff member can drop into the reply box; copy, not data. */
const QUICK_REPLIES = [
  { chip: "Looking into it", text: "Thanks for writing in, I am looking into this now." },
  { chip: "Ask for device", text: "Could you tell me which device and app version you are on?" },
  { chip: "Ask for a screenshot", text: "Could you send a screenshot of what you see?" },
  {
    chip: "Fixed",
    text: "This is fixed on our side. Please reopen the app and tell me if it still happens.",
  },
];

/** Ready-made reasons for the dialogs (the text still goes through the same 3 to 500 character checks). */
const RESOLVE_REASONS = ["Resolved for the learner", "Duplicate", "No longer needed"] as const;
const REOPEN_REASONS = ["The learner wrote back", "Closed too early"] as const;
const WAITING_REASONS = [
  "Asked the learner for more detail",
  "Waiting for the learner to try again",
] as const;
const BACK_TO_OPEN_REASONS = ["The learner replied", "Needs a closer look"] as const;
const HAND_REASONS = [
  "The learner is upset or threatening to leave",
  "Billing or refund decision needed",
  "Looks like a bug only an owner can judge",
] as const;
const CLEAR_REASONS = ["Handled", "Not urgent after all"] as const;

type Detail = TicketDetail & { me: string };
type Dialog =
  | { kind: "status"; status: "open" | "waiting_learner" | "solved" }
  | { kind: "assign"; to: string | null; name: string }
  | { kind: "hand" }
  | { kind: "clear" };

function Card({
  title,
  hint,
  tint,
  children,
}: {
  title: string;
  hint?: string;
  tint?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={`grid gap-2.5 rounded-2xl border p-4 ${tint ? "border-ds-action bg-ds-action-tint" : "border-ds-line bg-ds-card"}`}
    >
      <h3 className="text-xs font-extrabold uppercase tracking-wider text-ds-ink-soft">
        {title}
        {hint ? (
          <span className="ml-1 font-semibold normal-case tracking-normal"> {hint}</span>
        ) : null}
      </h3>
      {children}
    </section>
  );
}

function Line({ m }: { m: TicketMessage }) {
  if (m.kind === "system") {
    return (
      <p className="justify-self-center rounded-xl bg-ds-sunk px-3 py-1 text-center text-xs font-bold text-ds-ink-soft">
        {m.body}
      </p>
    );
  }
  const staff = m.kind === "staff";
  const who =
    m.kind === "learner"
      ? "Learner"
      : m.kind === "ai"
        ? "Miya (AI helper)"
        : `${m.authorName ?? "Staff"} · support`;
  return (
    <div className={`grid max-w-[88%] gap-0.5 ${staff ? "justify-self-end" : ""}`}>
      <p
        className={`flex flex-wrap items-center gap-1.5 text-xs font-bold text-ds-ink-soft ${staff ? "justify-end" : ""}`}
      >
        {who}
        <span className="font-semibold">{stampLabel(m.at)}</span>
      </p>
      {/* Plain text only: React escapes it, newlines are kept, nothing is rendered as HTML or markdown. */}
      <p
        className={`whitespace-pre-wrap break-words rounded-2xl border px-3.5 py-2.5 text-sm text-ds-ink ${
          staff
            ? "border-ds-choice-edge bg-ds-choice-tint"
            : m.kind === "ai"
              ? "border-dashed border-ds-line bg-ds-card"
              : "border-ds-line bg-ds-sunk"
        }`}
      >
        {m.body}
      </p>
    </div>
  );
}

function proText(pro: NonNullable<TicketDetail["facts"]>["pro"]): string {
  if (pro.unavailable) return "Could not check";
  if (!pro.active) return "No Pro";
  if (pro.source === "gift") return pro.until ? `Pro (gift) until ${pro.until}` : "Pro (gift)";
  return "Pro (store purchase)";
}

function Facts({ detail }: { detail: Detail }) {
  const f = detail.facts;
  if (!f) {
    return <p className="text-sm text-ds-ink-soft">The learner's facts could not be loaded.</p>;
  }
  const text: [string, string][] = [
    ["Pro", proText(f.pro)],
    ["Course, level", [courseName(f.course), f.level].filter(Boolean).join(", ") || "Unknown"],
    ["Last active", f.lastActiveDay ?? "Unknown"],
    ["Platforms", f.platforms.length ? f.platforms.join(", ") : "Unknown"],
    ["Social features blocked", f.socialBlocked ? "Yes" : "No"],
  ];
  return (
    <>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {text.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-semibold text-ds-ink-soft">{k}</dt>
            <dd className="text-right font-bold text-ds-ink">{v}</dd>
          </div>
        ))}
        <div className="contents">
          <dt className="font-semibold text-ds-ink-soft">Streak</dt>
          <dd className="text-right font-bold text-ds-ink">
            <Figure value={f.streak} kind="days" reason="unknown" />
          </dd>
        </div>
        <div className="contents">
          <dt className="font-semibold text-ds-ink-soft">Active days, last 30</dt>
          <dd className="text-right font-bold text-ds-ink">
            <Figure value={f.daysActiveLast30} reason="unknown" />
          </dd>
        </div>
        <div className="contents">
          <dt className="font-semibold text-ds-ink-soft">Lessons, last 7 days</dt>
          <dd className="text-right font-bold text-ds-ink">
            <Figure value={f.lessonsLast7Days} reason="unknown" />
          </dd>
        </div>
        <div className="contents">
          <dt className="font-semibold text-ds-ink-soft">Earlier tickets</dt>
          <dd className="text-right font-bold text-ds-ink">
            <Figure value={f.previousTickets.length} reason="unknown" />
          </dd>
        </div>
      </dl>
      {f.previousTickets.length > 0 ? (
        <p className="text-xs font-semibold text-ds-ink-soft">
          Earlier:{" "}
          {f.previousTickets
            .map((t) => [t.status, t.topic, t.day].filter(Boolean).join(", "))
            .join("; ")}
          .
        </p>
      ) : null}
      {detail.factsSource === "rebuilt" ? (
        <p className="text-xs font-semibold text-ds-ink-soft">
          The AI has not answered in this chat, so these were read just now.
        </p>
      ) : null}
      <p className="text-xs font-semibold text-ds-ink-soft">
        No email, notes, payment details or lesson answers are shown here.
      </p>
    </>
  );
}

const btn =
  "min-h-11 rounded-xl border border-ds-line bg-ds-card px-3 text-sm font-bold text-ds-ink disabled:opacity-50";

/**
 * One ticket: its header (number, status, area, who), the SLA box, the actions, the conversation, the reply box, the
 * internal notes, the AI summary and the learner's facts. Every action goes through the SupportApi; the ones that
 * change a ticket's state or hand it to someone else ask for a reason first (a reply, a note and taking a ticket for
 * yourself do not). A button that would do nothing is not drawn.
 */
export function TicketPane({
  ticketId,
  scopes,
  role,
  api,
  now,
  onBack,
  onChanged,
}: {
  ticketId: string;
  scopes: readonly string[];
  role: string;
  api: SupportApi;
  now: number | null;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [assignable, setAssignable] = useState<Assignable[] | null>(null);
  const thread = useRef<HTMLDivElement>(null);

  const canReply = scopes.includes("support.reply");
  const canAssign = scopes.includes("support.assign");
  const isOwner = role === "owner";
  const manager = scopes.includes("staff.manage");

  async function load() {
    try {
      setDetail(await api.getTicket(ticketId));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not read the ticket.");
    }
  }
  useEffect(() => {
    setDetail(null);
    setError(null);
    setNotice(null);
    setReply("");
    setNote("");
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when another ticket is opened
  }, [ticketId]);

  // Who a manager may hand a ticket to; a person without staff.manage never asks.
  useEffect(() => {
    if (!manager) return;
    let live = true;
    api
      .listAssignable()
      .then((list) => live && setAssignable(list))
      .catch(() => live && setAssignable(null));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per pane
  }, [manager]);

  const messageCount = detail?.messages.length ?? null;
  useEffect(() => {
    if (messageCount !== null && thread.current) {
      thread.current.scrollTop = thread.current.scrollHeight;
    }
  }, [messageCount]);

  async function act(run: () => Promise<unknown>, done: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await run();
      setNotice(done);
      await load();
      onChanged();
      return true;
    } catch (e) {
      setNotice(null);
      setError(e instanceof Error ? e.message : "That did not go through. Nothing was changed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitDialog(reason: string) {
    if (!dialog) return;
    setDialogError(null);
    setBusy(true);
    try {
      if (dialog.kind === "status") {
        await api.setStatus(ticketId, dialog.status, reason);
      } else if (dialog.kind === "assign") {
        await api.assign(ticketId, dialog.to, reason);
      } else if (dialog.kind === "hand") {
        await api.handToOwner(ticketId, reason);
      } else {
        await api.clearUrgent(ticketId, reason);
      }
      setDialog(null);
      setNotice(
        dialog.kind === "status"
          ? dialog.status === "solved"
            ? "Marked resolved."
            : dialog.status === "open"
              ? "Back in the needs-reply queue."
              : "Waiting on the learner."
          : dialog.kind === "assign"
            ? dialog.to
              ? `Assigned to ${dialog.name}.`
              : "Ticket unassigned."
            : dialog.kind === "hand"
              ? "Handed to an owner as urgent."
              : "Urgent flag cleared.",
      );
      await load();
      onChanged();
    } catch (e) {
      setDialogError(
        e instanceof Error ? e.message : "That did not go through. Nothing was changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function sendReply(event: FormEvent) {
    event.preventDefault();
    const body = reply.trim();
    if (!body || busy) return;
    if (await act(() => api.reply(ticketId, body), "Reply sent.")) setReply("");
  }
  async function sendNote(event: FormEvent) {
    event.preventDefault();
    const body = note.trim();
    if (!body || busy) return;
    if (await act(() => api.note(ticketId, body), "Note added.")) setNote("");
  }

  const header = (
    <div className="flex items-start gap-3 border-b border-ds-line p-4">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to the list"
        className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-ds-line text-ds-ink lg:hidden"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <div className="min-w-0 flex-1">
        {detail ? (
          <>
            <p className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-ds-ink-faint">
              {detail.ticketNo !== null ? (
                <span className="font-mono">
                  #<Figure value={String(detail.ticketNo)} reason="" />
                </span>
              ) : null}
              <StatusPill status={detail.status} />
              {detail.urgent ? <UrgentBadge /> : null}
              <span>{label(TOPIC_LABELS, detail.topic, "Other")}</span>
              <span>{label(CHANNEL_LABELS, detail.channel)}</span>
            </p>
            <h2 className="mt-1 font-display text-lg font-extrabold text-ds-ink">
              {detail.displayName ?? "Support ticket"}
            </h2>
            <p className="text-sm text-ds-ink-soft">
              {detail.facts
                ? [courseName(detail.facts.course), detail.facts.level]
                    .filter(Boolean)
                    .join(", ") || "Course unknown"
                : "The learner's facts could not be loaded."}
              {detail.facts ? " · " : ""}
              {detail.facts ? proText(detail.facts.pro) : ""}
              {" · "}
              {detail.assignedTo === null
                ? "Unassigned"
                : detail.assignedTo === detail.me
                  ? "Assigned to you"
                  : `Assigned to ${detail.assignedName ?? "another staff member"}`}
            </p>
          </>
        ) : (
          <h2 className="font-display text-lg font-extrabold text-ds-ink">Ticket</h2>
        )}
      </div>
      {detail ? (
        <div
          data-sla=""
          className={`rounded-xl border px-3 py-2 text-right ${
            detail.breaching ? "border-ds-flame bg-ds-flame-tint" : "border-ds-line bg-ds-sunk"
          }`}
        >
          <p className="text-xs font-bold uppercase tracking-wider text-ds-ink-soft">
            {detail.status === "solved"
              ? "Resolved"
              : detail.status === "waiting_learner"
                ? "Waiting on learner"
                : "Waiting for a reply"}
          </p>
          <p
            className={`font-display text-base font-extrabold ${detail.breaching ? "text-ds-flame" : "text-ds-ink"}`}
          >
            {detail.status === "solved"
              ? detail.solvedAt
                ? stampLabel(detail.solvedAt)
                : ""
              : now === null
                ? ""
                : (waitingLabel(detail.waitingSince, now) ?? "")}
            {detail.breaching ? <span className="sr-only"> (breaching)</span> : null}
          </p>
        </div>
      ) : null}
    </div>
  );

  const solved = detail?.status === "solved";
  const mine = detail ? detail.assignedTo === detail.me : false;
  const others = (assignable ?? []).filter((s) => s.userId !== detail?.assignedTo);

  return (
    <section aria-label="Ticket" className="flex min-h-0 flex-1 flex-col">
      {header}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4" ref={thread}>
        {loadError ? (
          <p role="alert" className="text-sm font-semibold text-ds-wrong-ink">
            {loadError}
          </p>
        ) : null}
        {!detail && !loadError ? <p className="text-sm text-ds-ink-soft">Loading…</p> : null}
        {detail ? (
          <>
            {detail.aiSummary || detail.handoffReason ? (
              <Card title="AI summary, may be wrong" tint>
                {detail.aiSummary ? (
                  <p className="whitespace-pre-wrap break-words text-sm leading-snug text-ds-ink">
                    {detail.aiSummary}
                  </p>
                ) : (
                  <p className="text-sm text-ds-ink-soft">No summary was written.</p>
                )}
                {detail.handoffReason ? (
                  <p className="text-xs font-semibold text-ds-ink-soft">
                    Reason: {label(HANDOFF_LABELS, detail.handoffReason, detail.handoffReason)}
                  </p>
                ) : null}
              </Card>
            ) : null}
            <div aria-label="Conversation" className="grid gap-3">
              {detail.messages.length === 0 ? (
                <p className="text-sm text-ds-ink-soft">No messages yet.</p>
              ) : (
                detail.messages.map((m) => <Line key={m.id} m={m} />)
              )}
            </div>
            <Card title="Internal notes" hint="(the learner never sees these)">
              {detail.notes.length === 0 ? (
                <p className="text-sm text-ds-ink-soft">No notes.</p>
              ) : (
                <ul className="grid gap-2">
                  {detail.notes.map((n) => (
                    <li
                      key={n.id}
                      className="rounded-xl border border-ds-action bg-ds-action-tint px-3 py-2 text-sm text-ds-ink"
                    >
                      <span className="whitespace-pre-wrap break-words">{n.body}</span>
                      <small className="mt-0.5 block text-xs font-semibold text-ds-action-text">
                        {n.authorName ?? "Staff"} · {stampLabel(n.at)}
                      </small>
                    </li>
                  ))}
                </ul>
              )}
              {canReply ? (
                <form onSubmit={sendNote} className="grid gap-2">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={2000}
                    rows={2}
                    aria-label="New internal note"
                    placeholder="Add an internal note"
                    className="rounded-xl border border-ds-line bg-ds-sunk px-3 py-2 text-sm"
                  />
                  <div>
                    <button type="submit" disabled={!note.trim() || busy} className={btn}>
                      Add note
                    </button>
                  </div>
                </form>
              ) : null}
            </Card>
            <details className="rounded-2xl border border-ds-line bg-ds-card p-4">
              <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-wider text-ds-ink-soft">
                Learner facts <span className="font-semibold normal-case">(what the AI saw)</span>
              </summary>
              <div className="mt-2 grid gap-2">
                <Facts detail={detail} />
                {detail.learnerId ? (
                  <a
                    href={`/users/${detail.learnerId}`}
                    className="text-sm font-bold text-ds-choice underline"
                  >
                    Open learner page
                  </a>
                ) : null}
              </div>
            </details>
          </>
        ) : null}
      </div>

      <footer className="space-y-2 border-t border-ds-line bg-ds-card p-4">
        {error ? (
          <p role="alert" className="text-sm font-semibold text-ds-wrong-ink">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="text-sm font-semibold text-ds-ink">
            {notice}
          </p>
        ) : null}
        {detail ? (
          <div className="flex flex-wrap items-center gap-2" data-ticket-actions="">
            {canAssign && !mine && !solved ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  detail.assignedTo === null
                    ? void act(() => api.assign(ticketId, detail.me), "Assigned to you.")
                    : // Taking over a ticket someone else holds is a reassignment: it asks for a reason.
                      setDialog({ kind: "assign", to: detail.me, name: "you" })
                }
                className={btn}
              >
                Assign to me
              </button>
            ) : null}
            {canAssign && mine && !solved ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(() => api.assign(ticketId, null), "Ticket unassigned.")}
                className={btn}
              >
                Give back
              </button>
            ) : null}
            {manager && !solved && assignable && others.length > 0 ? (
              <label className="flex items-center gap-2 text-sm font-bold text-ds-ink">
                <span className="sr-only sm:not-sr-only">Assign to</span>
                <select
                  value=""
                  disabled={busy}
                  aria-label="Assign to someone else"
                  onChange={(e) => {
                    const pick = others.find((s) => s.userId === e.target.value);
                    if (pick) setDialog({ kind: "assign", to: pick.userId, name: pick.name });
                  }}
                  className="min-h-11 rounded-xl border border-ds-line bg-ds-card px-2 text-sm font-bold"
                >
                  <option value="">Someone else…</option>
                  {others.map((s) => (
                    <option key={s.userId} value={s.userId}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {manager && !solved && detail.assignedTo !== null && !mine ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setDialog({ kind: "assign", to: null, name: "" })}
                className={btn}
              >
                Unassign
              </button>
            ) : null}
            {canAssign && !isOwner && !solved && !detail.urgent ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setDialog({ kind: "hand" })}
                className={`${btn} !border-ds-flame !text-ds-flame`}
              >
                Hand to owner
              </button>
            ) : null}
            {isOwner && manager && detail.urgent ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setDialog({ kind: "clear" })}
                className={btn}
              >
                Clear urgent
              </button>
            ) : null}
            <span className="flex-1" />
            {canReply && (detail.status === "new" || detail.status === "open") ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setDialog({ kind: "status", status: "waiting_learner" })}
                className={btn}
              >
                Waiting on learner
              </button>
            ) : null}
            {canReply && detail.status === "waiting_learner" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setDialog({ kind: "status", status: "open" })}
                className={btn}
              >
                Needs reply
              </button>
            ) : null}
            {canReply && solved ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setDialog({ kind: "status", status: "open" })}
                className={btn}
              >
                Reopen
              </button>
            ) : null}
            {canReply && !solved ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setDialog({ kind: "status", status: "solved" })}
                className="min-h-11 rounded-xl bg-ds-right px-4 text-sm font-bold text-ds-on-hero disabled:opacity-50"
              >
                Resolve
              </button>
            ) : null}
          </div>
        ) : null}
        {detail && canReply && !solved ? (
          <form onSubmit={sendReply} className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {QUICK_REPLIES.map((q) => (
                <button
                  key={q.chip}
                  type="button"
                  onClick={() => setReply(q.text)}
                  className="rounded-full border border-ds-line px-2.5 py-1 text-xs font-semibold text-ds-ink-soft"
                >
                  {q.chip}
                </button>
              ))}
            </div>
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              maxLength={4000}
              rows={3}
              aria-label="Reply to the learner"
              placeholder="Write a reply to the learner. They see it in their Help chat."
              className="w-full rounded-xl border border-ds-line bg-ds-sunk px-3 py-2 text-sm"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-ds-ink-soft">
                Replies are logged and sent. The notification never contains your text.
              </span>
              <button
                type="submit"
                disabled={busy || !reply.trim()}
                className="min-h-11 rounded-xl bg-ds-brand px-4 text-sm font-bold text-ds-on-hero disabled:opacity-50"
              >
                Send reply
              </button>
            </div>
          </form>
        ) : detail ? (
          <p className="text-sm text-ds-ink-soft">
            {solved
              ? canReply
                ? "This ticket is resolved. Reopen it to reply."
                : "This ticket is resolved."
              : "You can read tickets but not reply."}
          </p>
        ) : null}
      </footer>

      {dialog ? (
        <ReasonDialog
          title={
            dialog.kind === "status"
              ? dialog.status === "solved"
                ? "Resolve this ticket"
                : dialog.status === "waiting_learner"
                  ? "Mark as waiting on the learner"
                  : solved
                    ? "Reopen this ticket"
                    : "Move back to needs reply"
              : dialog.kind === "assign"
                ? dialog.to
                  ? dialog.to === detail?.me
                    ? "Take over this ticket"
                    : `Assign to ${dialog.name}`
                  : "Unassign this ticket"
                : dialog.kind === "hand"
                  ? "Hand to owner"
                  : "Clear the urgent flag"
          }
          description={
            dialog.kind === "hand"
              ? "The ticket goes to an owner and is marked urgent. Every action is logged."
              : "Every action is logged. Pick a reason or write your own so the next person has the context."
          }
          suggestions={
            dialog.kind === "status"
              ? dialog.status === "solved"
                ? RESOLVE_REASONS
                : dialog.status === "waiting_learner"
                  ? WAITING_REASONS
                  : solved
                    ? REOPEN_REASONS
                    : BACK_TO_OPEN_REASONS
              : dialog.kind === "hand"
                ? HAND_REASONS
                : dialog.kind === "clear"
                  ? CLEAR_REASONS
                  : undefined
          }
          confirmLabel={
            dialog.kind === "status"
              ? dialog.status === "solved"
                ? "Resolve and log"
                : "Change and log"
              : dialog.kind === "assign"
                ? "Assign and log"
                : dialog.kind === "hand"
                  ? "Hand over and log"
                  : "Clear and log"
          }
          busy={busy}
          error={dialogError}
          onCancel={() => {
            setDialog(null);
            setDialogError(null);
          }}
          onSubmit={(reason) => void submitDialog(reason)}
        />
      ) : null}
    </section>
  );
}
