import { useState, type FormEvent, type ReactNode } from "react";
import { formatDateTime, formatDay } from "../../../lib/staff-dates";
import { ACTION_LABEL, allowedActions, type UserAction } from "../../../lib/staff-actions";
import type { LearnerFacts } from "../../../lib/staff-user-facts.server";
import { ActionDialog, type ActionInput } from "../../staff/ActionDialog";
import { Button } from "../../ui/Button";
import { Figure } from "../Figure";

const day = (iso: string | null) => (iso ? formatDay(iso) : "Unknown");

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-ds-line bg-ds-card p-3">
      <dt className="text-xs font-extrabold uppercase tracking-wider text-ds-ink-soft">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-ds-ink">{children}</dd>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="grid gap-2.5 rounded-2xl border border-ds-line bg-ds-card p-4">
      <h3 className="text-xs font-extrabold uppercase tracking-wider text-ds-ink-soft">
        {title}
        {hint ? (
          <span className="ml-1 font-semibold normal-case tracking-normal">{hint}</span>
        ) : null}
      </h3>
      {children}
    </section>
  );
}

/**
 * The plan is a live per-learner read of RevenueCat. With no key set it says so ("Not connected"); with a key it could
 * not use it says "Could not check". Neither is ever shown as "Free".
 */
export function planText(pro: LearnerFacts["pro"]): string {
  if (pro.notConnected) return "Not connected";
  if (pro.unavailable) return "Could not check";
  if (!pro.active) return "Free";
  if (pro.source === "gift") return `Pro (gift)${pro.until ? ` until ${day(pro.until)}` : ""}`;
  return "Pro (store purchase)";
}

/** One learner: account facts, the plan, notes, and the actions the viewer's scopes allow. */
export function LearnerPane({
  facts,
  scopes,
  busy,
  error,
  notice,
  onClose,
  onAction,
  onAddNote,
  dialog,
  onCancelDialog,
  onSubmitDialog,
}: {
  facts: LearnerFacts;
  scopes: readonly string[];
  busy: boolean;
  error: string | null;
  notice: string | null;
  onClose: () => void;
  onAction: (action: UserAction) => void;
  onAddNote: (body: string) => void;
  dialog: UserAction | null;
  onCancelDialog: () => void;
  onSubmitDialog: (input: ActionInput) => void;
}) {
  const [note, setNote] = useState("");
  const active = facts.restrictions.filter((r) => r.liftedAt === null);
  const actions = allowedActions(scopes, facts);
  function submitNote(event: FormEvent) {
    event.preventDefault();
    if (note.trim() && !busy) {
      onAddNote(note.trim());
      setNote("");
    }
  }
  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl font-semibold text-ds-ink">
              {facts.displayName ?? "(no name)"}
            </h2>
            {active.length > 0 ? (
              <span className="inline-block rounded-full bg-ds-sunk px-2.5 py-0.5 text-xs font-extrabold text-ds-wrong-ink">
                {active.map((r) => (r.kind === "ban" ? "Banned" : "Blocked")).join(" and ")}
              </span>
            ) : null}
          </div>
          <p className="break-all text-sm text-ds-ink-soft">{facts.email}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 flex-none rounded-xl border border-ds-line px-3 text-sm font-bold text-ds-ink"
        >
          Close
        </button>
      </div>
      {notice ? (
        <p role="status" className="text-sm font-semibold text-ds-ink">
          {notice}
        </p>
      ) : null}
      {error && !dialog ? (
        <p role="alert" className="text-sm font-semibold text-ds-wrong-ink">
          {error}
        </p>
      ) : null}

      <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <Fact label="Plan">
          <span data-plan="">{planText(facts.pro)}</span>
        </Fact>
        <Fact label="Joined">{day(facts.createdAt)}</Fact>
        <Fact label="Course and level">
          {facts.course ? `${facts.course.toUpperCase()} · ${facts.level ?? "?"}` : "Unknown"}
        </Fact>
        <Fact label="Last active">{day(facts.lastActiveAt)}</Fact>
        <Fact label="Streak">
          <Figure value={facts.streak} kind="days" reason="Unknown" />
        </Fact>
        <Fact label="Total XP">
          <Figure value={facts.xp} reason="Unknown" />
        </Fact>
        <Fact label="Lessons done">
          <Figure value={facts.lessonsDone} reason="Could not read" />
        </Fact>
        <Fact label="Reports against">
          <Figure value={facts.reportsAgainst} reason="Unknown" />
        </Fact>
        <Fact label="Platforms">
          {facts.platforms.length ? facts.platforms.join(", ") : "Unknown"}
        </Fact>
        <Fact label="Restrictions">
          {facts.restrictions.length === 0
            ? "None"
            : facts.restrictions.map((r) => (
                <span key={r.createdAt + r.kind} className="block text-sm font-normal">
                  {r.kind === "ban" ? "Ban" : "Block"}: {r.reason} ({day(r.createdAt)}
                  {r.liftedAt ? `, lifted ${day(r.liftedAt)}` : ", active"})
                </span>
              ))}
        </Fact>
        <Fact label="Gifted Pro">
          {facts.gifts.length === 0
            ? "None"
            : facts.gifts.map((g) => (
                <span key={g.endsAt + g.reason} className="block text-sm font-normal">
                  until {day(g.endsAt)}: {g.reason}
                  {g.revokedAt ? " (ended early)" : ""}
                </span>
              ))}
        </Fact>
      </dl>

      <Section title="Actions">
        {actions.length === 0 ? (
          <p className="text-sm text-ds-ink-soft">No actions are available to you.</p>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            {actions.map((action) => (
              <Button
                key={action}
                variant={action === "delete" || action === "ban" ? "danger" : "secondary"}
                className="!px-4 !py-2 text-sm"
                onClick={() => onAction(action)}
              >
                {ACTION_LABEL[action]}
              </Button>
            ))}
          </div>
        )}
        <p className="text-xs font-semibold text-ds-ink-soft">
          Every action asks for a reason and goes in the action record. Ban and delete also need the
          learner&rsquo;s email typed back.
        </p>
      </Section>

      <Section title="Notes" hint="(internal)">
        {scopes.includes("users.notes") ? (
          <form onSubmit={submitNote} className="flex flex-col gap-2 sm:flex-row">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              rows={2}
              aria-label="New note"
              placeholder="Add an internal note"
              className="flex-1 rounded-xl border border-ds-line bg-ds-sunk px-3 py-2 text-sm"
            />
            <Button type="submit" disabled={!note.trim() || busy} className="!py-2 self-start">
              Add note
            </Button>
          </form>
        ) : null}
        <ul className="grid gap-2">
          {facts.notes.length === 0 ? (
            <li className="text-sm text-ds-ink-soft">No notes.</li>
          ) : null}
          {facts.notes.map((n) => (
            <li
              key={n.createdAt + n.body}
              className="rounded-2xl border border-ds-line bg-ds-sunk p-3"
            >
              <p className="whitespace-pre-wrap text-sm text-ds-ink">{n.body}</p>
              <p className="mt-1 text-xs text-ds-ink-soft">
                {n.author} · {formatDateTime(n.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <p className="text-xs font-semibold text-ds-ink-soft">
        Opening this learner is in the action record, with who and when.
      </p>

      {dialog ? (
        <ActionDialog
          action={dialog}
          learnerLabel={facts.displayName ?? facts.email}
          busy={busy}
          error={error}
          onCancel={onCancelDialog}
          onSubmit={onSubmitDialog}
        />
      ) : null}
    </div>
  );
}
