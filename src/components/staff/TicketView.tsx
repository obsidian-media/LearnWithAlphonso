import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "../ui/Button";
import type { TicketDetail, TicketMessage } from "../../lib/staff-support.server";
import {
  CHANNEL_LABELS,
  HANDOFF_LABELS,
  STATUS_LABELS,
  TOPIC_LABELS,
  courseName,
  label,
  stampLabel,
  ticketTitle,
} from "../../lib/support-inbox-copy";
import { StatusPill } from "./TicketList";

export type AssignableStaff = { userId: string; name: string };
export type TicketViewData = TicketDetail & { me: string };

const REPLY_MAX = 4000;
const NOTE_MAX = 2000;

function Card({
  title,
  hint,
  tint,
  className = "",
  children,
}: {
  title: string;
  hint?: string;
  tint?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`grid gap-2.5 rounded-2xl border p-4 ${tint ? "border-ds-action bg-ds-action-tint" : "border-ds-line bg-ds-card"} ${className}`}
    >
      <h2 className="text-xs font-extrabold uppercase tracking-wider text-ds-ink-soft">
        {title}
        {hint ? (
          <span className="ml-1 font-semibold normal-case tracking-normal"> {hint}</span>
        ) : null}
      </h2>
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
        ? "Alphonso AI"
        : `${m.authorName ?? "Staff"} · support`;
  return (
    <div className={`grid max-w-[88%] gap-0.5 ${staff ? "justify-self-end" : ""}`}>
      <p
        className={`flex flex-wrap items-center gap-1.5 ds-type-overline text-ds-ink-soft ${staff ? "justify-end" : ""}`}
      >
        {who}
        {m.kind === "ai" ? (
          <span className="ds-type-caption rounded-lg bg-ds-sunk px-1.5 py-0.5">AI</span>
        ) : null}
        <span className="font-semibold normal-case tracking-normal">
          {stampLabel(m.at)}
          {m.kind === "ai" ? ", saw the facts on the right" : ""}
        </span>
      </p>
      {/* Plain text only: React escapes it, newlines are kept, nothing is rendered as HTML or markdown. */}
      <p
        className={`whitespace-pre-wrap break-words rounded-2xl border ds-type-body px-3.5 py-2.5 text-ds-ink ${
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
  if (!pro.active) return "Not active (none)";
  if (pro.source === "gift") return `Pro (gift)${pro.until ? ` until ${pro.until}` : ""}`;
  return "Pro (store purchase)";
}

function Facts({ ticket }: { ticket: TicketViewData }) {
  const f = ticket.facts;
  if (!f) {
    return <p className="text-sm text-ds-ink-soft">The learner's facts could not be loaded.</p>;
  }
  const rows: [string, string][] = [
    ["Pro", proText(f.pro)],
    ["Course, level", [courseName(f.course), f.level].filter(Boolean).join(", ") || "none yet"],
    ["Streak", `${f.streak} days`],
    ["Active days, last 30", String(f.daysActiveLast30)],
    ["Last active", f.lastActiveDay ?? "never"],
    [
      "Lessons, last 7 days",
      `${f.lessonsLast7Days}${f.lastLessonDay ? ` (last ${f.lastLessonDay})` : ""}`,
    ],
    ["Platforms", f.platforms.length ? f.platforms.join(", ") : "unknown"],
    ["Social features blocked", f.socialBlocked ? "Yes" : "No"],
    ["Earlier tickets", String(f.previousTickets.length)],
  ];
  return (
    <>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 ds-type-footnote">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-semibold text-ds-ink-soft">{k}</dt>
            <dd className="text-right font-bold text-ds-ink">{v}</dd>
          </div>
        ))}
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
      {ticket.factsSource === "rebuilt" ? (
        <p className="text-xs font-semibold text-ds-ink-soft">
          The AI has not answered in this chat, so these were read just now.
        </p>
      ) : null}
    </>
  );
}

/** One ticket: the conversation, the reply box, internal notes, status and owner, the AI summary and the facts. */
export function TicketView({
  ticket,
  scopes,
  assignable,
  busy,
  error,
  notice,
  onReply,
  onNote,
  onAssign,
  onStatus,
}: {
  ticket: TicketViewData;
  scopes: readonly string[];
  /** Who a manager may hand the ticket to; null when the viewer cannot assign to others. */
  assignable: AssignableStaff[] | null;
  busy: boolean;
  error: string | null;
  notice: string | null;
  onReply: (body: string) => Promise<boolean>;
  onNote: (body: string) => Promise<boolean>;
  onAssign: (assignTo: string | null) => void;
  onStatus: (status: "open" | "waiting_learner" | "solved") => void;
}) {
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const canReply = scopes.includes("support.reply");
  const canAssign = scopes.includes("support.assign");
  const solved = ticket.status === "solved";
  const mine = ticket.assignedTo === ticket.me;
  const owner = !ticket.assignedTo
    ? "Unassigned"
    : mine
      ? "You"
      : (ticket.assignedName ?? "Another staff member");

  async function sendReply(event: FormEvent) {
    event.preventDefault();
    if (reply.trim() && (await onReply(reply.trim()))) setReply("");
  }
  async function sendNote(event: FormEvent) {
    event.preventDefault();
    if (note.trim() && (await onNote(note.trim()))) setNote("");
  }

  const meta = [
    label(CHANNEL_LABELS, ticket.channel),
    `opened ${stampLabel(ticket.createdAt)}`,
    ticket.assignedTo ? `assigned to ${owner}` : "unassigned",
  ].join(" · ");

  return (
    <section>
      <a href="/support" className="text-sm font-bold text-ds-choice underline">
        ← Support
      </a>
      <div className="mt-2 flex flex-wrap items-center gap-2.5">
        <h1 className="font-display text-2xl font-semibold text-ds-ink">
          {ticketTitle(ticket.topic)}
        </h1>
        <StatusPill status={ticket.status} />
        <span className="text-xs font-semibold text-ds-ink-soft">{meta}</span>
      </div>
      {notice ? <p className="mt-3 text-sm text-ds-ink">{notice}</p> : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-ember">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_330px] lg:items-start lg:gap-4">
        {/* On a phone both columns dissolve into one stack in the order drawn: controls, summary, conversation,
            facts, notes, then the reply box pinned at the bottom. On a desktop they are the two columns. */}
        <div className="contents lg:flex lg:flex-col lg:gap-4">
          <Card title="Conversation" className="order-3 lg:order-none">
            {ticket.messages.length === 0 ? (
              <p className="text-sm text-ds-ink-soft">No messages yet.</p>
            ) : (
              <div aria-label="Conversation" className="grid gap-3">
                {ticket.messages.map((m) => (
                  <Line key={m.id} m={m} />
                ))}
              </div>
            )}
          </Card>

          <form
            onSubmit={sendReply}
            className="order-last grid gap-2 border-t border-ds-line bg-ds-surface px-0 pb-4 pt-2.5 max-lg:sticky max-lg:bottom-0 max-lg:-mx-4 max-lg:px-4 lg:order-none lg:rounded-2xl lg:border lg:bg-ds-card lg:p-4"
          >
            <h2 className="hidden text-xs font-extrabold uppercase tracking-wider text-ds-ink-soft lg:block">
              Reply to the learner
            </h2>
            {!canReply ? (
              <p className="text-sm text-ds-ink-soft">You can read tickets but not reply.</p>
            ) : solved ? (
              <p className="text-sm text-ds-ink-soft">This ticket is solved. Reopen it to reply.</p>
            ) : (
              <>
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  maxLength={REPLY_MAX}
                  rows={3}
                  aria-label="Reply to the learner"
                  placeholder="Write a reply. The learner sees it in their Help chat."
                  className="min-h-12 rounded-xl border border-ds-line bg-ds-sunk px-3 py-2 text-sm"
                />
                <div className="flex items-center justify-between gap-3">
                  <span className="hidden text-xs font-semibold text-ds-ink-soft lg:inline">
                    The learner is notified, but the notification never contains your text.{" "}
                    {reply.length} / {REPLY_MAX}
                  </span>
                  <Button
                    type="submit"
                    disabled={!reply.trim() || busy}
                    className="ml-auto !min-h-10 !px-4 !py-2 text-sm"
                  >
                    Send reply
                  </Button>
                </div>
              </>
            )}
          </form>

          <Card
            title="Internal notes"
            hint="(the learner never sees these)"
            className="order-5 lg:order-none"
          >
            {ticket.notes.length === 0 ? (
              <p className="text-sm text-ds-ink-soft">No notes.</p>
            ) : (
              <ul className="grid gap-2">
                {ticket.notes.map((n) => (
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
                  maxLength={NOTE_MAX}
                  rows={2}
                  aria-label="New internal note"
                  placeholder="Add an internal note"
                  className="rounded-xl border border-ds-line bg-ds-sunk px-3 py-2 text-sm"
                />
                <div>
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={!note.trim() || busy}
                    className="!min-h-9 !px-3 !py-1 text-sm"
                  >
                    Add note
                  </Button>
                </div>
              </form>
            ) : null}
          </Card>
        </div>

        <div className="contents lg:flex lg:flex-col lg:gap-4">
          <Card title="Status and owner" className="order-1 lg:order-none">
            <label className="flex items-center justify-between gap-2 rounded-xl border border-ds-line bg-ds-card px-3 py-1.5 text-sm font-bold text-ds-ink">
              Status
              <select
                value={ticket.status === "new" ? "" : ticket.status}
                disabled={!canReply || busy}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "open" || v === "waiting_learner" || v === "solved") onStatus(v);
                }}
                className="min-h-9 bg-transparent text-right font-bold"
              >
                {ticket.status === "new" ? (
                  <option value="" disabled>
                    {STATUS_LABELS.new}
                  </option>
                ) : null}
                <option value="open">{STATUS_LABELS.open}</option>
                <option value="waiting_learner" disabled={solved}>
                  {STATUS_LABELS.waiting_learner}
                </option>
                <option value="solved">{STATUS_LABELS.solved}</option>
              </select>
            </label>
            {assignable ? (
              <label className="flex items-center justify-between gap-2 rounded-xl border border-ds-line bg-ds-card px-3 py-1.5 text-sm font-bold text-ds-ink">
                Assigned to
                <select
                  value={ticket.assignedTo ?? ""}
                  disabled={!canAssign || busy}
                  onChange={(e) => onAssign(e.target.value || null)}
                  className="min-h-9 max-w-[60%] bg-transparent text-right font-bold"
                >
                  <option value="">Unassigned</option>
                  {assignable.map((s) => (
                    <option key={s.userId} value={s.userId}>
                      {s.userId === ticket.me ? "You" : s.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="flex items-center justify-between gap-2 rounded-xl border border-ds-line bg-ds-card px-3 py-2 text-sm font-bold text-ds-ink">
                Assigned to <span>{owner}</span>
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {canAssign && !mine ? (
                <Button
                  variant="secondary"
                  className="!min-h-9 !px-3 !py-1 text-sm"
                  disabled={busy}
                  onClick={() => onAssign(ticket.me)}
                >
                  Assign to me
                </Button>
              ) : null}
              {canAssign && mine ? (
                <Button
                  variant="secondary"
                  className="!min-h-9 !px-3 !py-1 text-sm"
                  disabled={busy}
                  onClick={() => onAssign(null)}
                >
                  Give back
                </Button>
              ) : null}
              {canReply ? (
                <Button
                  variant="secondary"
                  className="!min-h-9 !px-3 !py-1 text-sm"
                  disabled={busy}
                  onClick={() => onStatus(solved ? "open" : "solved")}
                >
                  {solved ? "Reopen" : "Mark solved"}
                </Button>
              ) : null}
            </div>
            <p className="text-xs font-semibold text-ds-ink-soft">
              Handing a ticket to someone else needs the Staff permission. Every change is recorded.
            </p>
          </Card>

          {ticket.aiSummary || ticket.handoffReason || ticket.topic ? (
            <Card title="AI summary, may be wrong" tint className="order-2 lg:order-none">
              {ticket.aiSummary ? (
                <p className="whitespace-pre-wrap break-words text-sm leading-snug text-ds-ink">
                  {ticket.aiSummary}
                </p>
              ) : (
                <p className="text-sm text-ds-ink-soft">No summary was written.</p>
              )}
              <p className="text-xs font-semibold text-ds-ink-soft">
                {[
                  ticket.handoffReason
                    ? `Reason: ${label(HANDOFF_LABELS, ticket.handoffReason, ticket.handoffReason)}`
                    : "",
                  ticket.topic ? `Topic: ${label(TOPIC_LABELS, ticket.topic, ticket.topic)}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </Card>
          ) : null}

          <Card title="Learner facts" hint="(what the AI saw)" className="order-4 lg:order-none">
            <Facts ticket={ticket} />
            <p className="text-xs font-semibold text-ds-ink-soft">
              No email, notes, payment details or lesson answers are shown here.
            </p>
            {ticket.learnerId ? (
              <>
                <a
                  href={`/users/${ticket.learnerId}`}
                  className="text-sm font-bold text-ds-choice underline"
                >
                  Open learner page
                </a>
                <p className="text-xs font-semibold text-ds-ink-soft">
                  Needs Users access. Opens email, display name and the learner's actions.
                </p>
              </>
            ) : null}
          </Card>

          <Card title="Recorded" className="order-6 lg:order-none">
            <p className="text-xs font-semibold text-ds-ink-soft">
              You opened this ticket. Opening, replies, status, assignment and notes go in the
              action record, without message text.
            </p>
          </Card>
        </div>
      </div>
    </section>
  );
}
