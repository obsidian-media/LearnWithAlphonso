import { useEffect, useState, type FormEvent } from "react";
import type { TicketDetail } from "../../../lib/staff-support.server";
import { TOPIC_LABELS, courseName, label, stampLabel } from "../../../lib/support-inbox-copy";
import { ticketStatusWord } from "../../../lib/console-format";
import { Figure } from "../Figure";
import type { HomeApi } from "./homeApi";

/** Canned openings the staff member can drop into the reply box; copy, not data. */
const QUICK_REPLIES = [
  { chip: "Looking into it", text: "Thanks for writing in, I am looking into this now." },
  { chip: "Ask for device", text: "Could you tell me which device and app version you are on?" },
  {
    chip: "Fixed",
    text: "This is fixed on our side. Please reopen the app and tell me if it still happens.",
  },
];

type Detail = TicketDetail & { me: string };

function proText(pro: NonNullable<TicketDetail["facts"]>["pro"]): string {
  if (pro.unavailable) return "Plan could not be checked";
  if (!pro.active) return "No Pro";
  return pro.source === "gift" ? "Pro (gift)" : "Pro";
}

/**
 * The triage drawer: one ticket's conversation with the reply box, "Assign to me" and "Resolve", all through the
 * EXISTING server functions. Opening it reads the ticket, which the server records in the action record first. A
 * full-width sheet on a phone, a side panel on a desktop. Reply and Assign need no reason (a message, a self-claim);
 * Resolve keeps its current behaviour in this PR.
 */
export function TicketDrawer({
  ticketId,
  scopes,
  api,
  onClose,
  onChanged,
}: {
  ticketId: string;
  scopes: readonly string[];
  api: HomeApi;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when another ticket is opened
  }, [ticketId]);

  async function act(run: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await run();
      after?.();
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not go through. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  function send(event: FormEvent) {
    event.preventDefault();
    if (!body.trim() || busy) return;
    void act(
      () => api.replyTicket(ticketId, body.trim()),
      () => setBody(""),
    );
  }

  const canReply = scopes.includes("support.reply");
  const canAssign = scopes.includes("support.assign");
  const mine = detail ? detail.assignedTo === detail.me : false;
  const solved = detail?.status === "solved";
  const facts = detail?.facts ?? null;

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Ticket">
      <button
        type="button"
        aria-label="Close the ticket"
        onClick={onClose}
        className="absolute inset-0 bg-ds-ink/40"
      />
      <section
        data-ticket-drawer=""
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-ds-card shadow-xl sm:w-[30rem]"
      >
        <header className="flex items-start gap-3 border-b border-ds-line p-4">
          <div className="min-w-0 flex-1">
            {detail ? (
              <>
                <p className="text-xs font-bold uppercase tracking-wider text-ds-ink-faint">
                  {label(TOPIC_LABELS, detail.topic, "Support ticket")}
                </p>
                <h2 className="font-display text-lg font-extrabold text-ds-ink">
                  {ticketStatusWord(detail.status)}
                </h2>
                {facts ? (
                  <p className="mt-0.5 text-sm text-ds-ink-soft">
                    {[courseName(facts.course), facts.level].filter(Boolean).join(", ") ||
                      "No course yet"}
                    {" · streak "}
                    <Figure value={facts.streak} reason="unknown" />
                    {" · "}
                    {proText(facts.pro)}
                  </p>
                ) : (
                  <p className="mt-0.5 text-sm text-ds-ink-soft">
                    The learner's facts could not be loaded.
                  </p>
                )}
              </>
            ) : (
              <h2 className="font-display text-lg font-extrabold text-ds-ink">Ticket</h2>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-h-11 min-w-11 rounded-xl border border-ds-line text-ds-ink-soft"
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
          {loadError ? (
            <p role="alert" className="text-sm font-semibold text-ds-wrong-ink">
              {loadError}
            </p>
          ) : null}
          {!detail && !loadError ? <p className="text-sm text-ds-ink-soft">Loading…</p> : null}
          {detail?.messages.map((m) =>
            m.kind === "system" ? (
              <p
                key={m.id}
                className="rounded-xl bg-ds-sunk px-3 py-1 text-center text-xs font-bold text-ds-ink-soft"
              >
                {m.body}
              </p>
            ) : (
              <div key={m.id} className={m.kind === "staff" ? "text-right" : ""}>
                <p className="text-xs font-bold text-ds-ink-soft">
                  {m.kind === "learner"
                    ? "Learner"
                    : m.kind === "ai"
                      ? "Miya (AI helper)"
                      : (m.authorName ?? "Staff")}{" "}
                  <span className="font-medium">{stampLabel(m.at)}</span>
                </p>
                {/* Plain text only: React escapes it and nothing is rendered as HTML. */}
                <p
                  className={`inline-block max-w-[90%] whitespace-pre-wrap break-words rounded-2xl border px-3 py-2 text-left text-sm text-ds-ink ${
                    m.kind === "staff"
                      ? "border-ds-choice-edge bg-ds-choice-tint"
                      : "border-ds-line bg-ds-sunk"
                  }`}
                >
                  {m.body}
                </p>
              </div>
            ),
          )}
        </div>

        <footer className="space-y-2 border-t border-ds-line p-4">
          {error ? (
            <p role="alert" className="text-sm font-semibold text-ds-wrong-ink">
              {error}
            </p>
          ) : null}
          {canReply && !solved ? (
            <form onSubmit={send} className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {QUICK_REPLIES.map((q) => (
                  <button
                    key={q.chip}
                    type="button"
                    onClick={() => setBody(q.text)}
                    className="rounded-full border border-ds-line px-2.5 py-1 text-xs font-semibold text-ds-ink-soft"
                  >
                    {q.chip}
                  </button>
                ))}
              </div>
              <label className="block text-sm font-semibold text-ds-ink">
                Reply
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={4000}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-ds-line bg-ds-sunk px-3 py-2 font-normal"
                />
              </label>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={busy || !body.trim()}
                  className="min-h-11 rounded-xl bg-ds-brand px-4 text-sm font-bold text-ds-on-hero disabled:opacity-50"
                >
                  Send reply
                </button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-ds-ink-soft">
              {solved
                ? "This ticket is resolved. Open it in Support to reopen it."
                : "You can read this ticket but not reply to it."}
            </p>
          )}
          {detail && !solved ? (
            <div className="flex flex-wrap justify-end gap-2">
              {canAssign && !mine ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void act(() => api.assignTicket(ticketId, detail.me))}
                  className="min-h-11 rounded-xl border border-ds-line px-3 text-sm font-bold text-ds-ink disabled:opacity-50"
                >
                  Assign to me
                </button>
              ) : null}
              {canReply ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void act(() => api.resolveTicket(ticketId))}
                  className="min-h-11 rounded-xl border border-ds-line px-3 text-sm font-bold text-ds-ink disabled:opacity-50"
                >
                  Resolve
                </button>
              ) : null}
            </div>
          ) : null}
        </footer>
      </section>
    </div>
  );
}
