import { useState, type FormEvent } from "react";
import { Button } from "../ui/Button";
import { ActionDialog, type ActionInput } from "./ActionDialog";
import { UserActionButtons } from "./UserActionButtons";
import type { UserAction } from "../../lib/staff-actions";
import type { LearnerFacts } from "../../lib/staff-user-facts.server";

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "never");

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-ds-line bg-ds-card p-3">
      <dt className="text-xs uppercase tracking-wider text-ds-ink-soft">{label}</dt>
      <dd className="mt-1 text-ds-ink">{children}</dd>
    </div>
  );
}

function proText(pro: LearnerFacts["pro"]): string {
  if (pro.unavailable) return "Could not check (RevenueCat unreachable)";
  if (!pro.active) return "No Pro";
  if (pro.source === "gift") return `Pro (gift)${pro.until ? ` until ${day(pro.until)}` : ""}`;
  return "Pro (store purchase)";
}

/** One learner: account facts, notes, and the actions the viewer's scopes allow. */
export function LearnerView({
  facts,
  scopes,
  dialog,
  busy,
  error,
  notice,
  onAction,
  onCancelDialog,
  onSubmitDialog,
  onAddNote,
}: {
  facts: LearnerFacts;
  scopes: readonly string[];
  dialog: UserAction | null;
  busy: boolean;
  error: string | null;
  notice: string | null;
  onAction: (action: UserAction) => void;
  onCancelDialog: () => void;
  onSubmitDialog: (input: ActionInput) => void;
  onAddNote: (body: string) => void;
}) {
  const [note, setNote] = useState("");
  const active = facts.restrictions.filter((r) => r.liftedAt === null);
  function submitNote(event: FormEvent) {
    event.preventDefault();
    if (note.trim()) {
      onAddNote(note.trim());
      setNote("");
    }
  }
  return (
    <section>
      <a href="/users" className="text-sm text-moss underline">
        ← Users
      </a>
      <h1 className="font-display mt-2 text-2xl font-semibold text-ds-ink">
        {facts.displayName ?? "(no name)"}
      </h1>
      <p className="text-sm text-ds-ink-soft">{facts.email}</p>
      {active.length > 0 ? (
        <p className="mt-2 inline-block rounded-full bg-ds-sunk px-3 py-1 text-sm font-medium text-ember">
          {active.map((r) => (r.kind === "ban" ? "Banned" : "Blocked")).join(" and ")}
        </p>
      ) : null}
      {notice ? <p className="mt-3 text-sm text-ds-ink">{notice}</p> : null}
      {error && !dialog ? (
        <p role="alert" className="mt-3 text-sm text-ember">
          {error}
        </p>
      ) : null}

      <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label="Joined">{day(facts.createdAt)}</Fact>
        <Fact label="Last active">{day(facts.lastActiveAt)}</Fact>
        <Fact label="Course and level">
          {facts.course ? `${facts.course.toUpperCase()} · ${facts.level ?? "?"}` : "none yet"}
        </Fact>
        <Fact label="Streak and XP">
          {facts.streak} days · {facts.xp} XP
        </Fact>
        <Fact label="Pro">{proText(facts.pro)}</Fact>
        <Fact label="Platforms">
          {facts.platforms.length ? facts.platforms.join(", ") : "unknown"}
        </Fact>
        <Fact label="Reports against">{facts.reportsAgainst}</Fact>
        <Fact label="Restrictions">
          {facts.restrictions.length === 0
            ? "none"
            : facts.restrictions.map((r) => (
                <span key={r.createdAt + r.kind} className="block text-sm">
                  {r.kind}: {r.reason} ({day(r.createdAt)}
                  {r.liftedAt ? `, lifted ${day(r.liftedAt)}` : ", active"})
                </span>
              ))}
        </Fact>
        <Fact label="Gifts">
          {facts.gifts.length === 0
            ? "none"
            : facts.gifts.map((g) => (
                <span key={g.endsAt + g.reason} className="block text-sm">
                  until {day(g.endsAt)}: {g.reason}
                  {g.revokedAt ? " (ended early)" : ""}
                </span>
              ))}
        </Fact>
      </dl>

      <h2 className="font-display mt-8 text-lg font-semibold text-ds-ink">Actions</h2>
      <div className="mt-2">
        <UserActionButtons scopes={scopes} facts={facts} onAction={onAction} />
      </div>

      <h2 className="font-display mt-8 text-lg font-semibold text-ds-ink">Notes</h2>
      {scopes.includes("users.notes") ? (
        <form onSubmit={submitNote} className="mt-2 flex flex-col gap-2 sm:flex-row">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            rows={2}
            aria-label="New note"
            placeholder="Add an internal note"
            className="flex-1 rounded-xl border border-ds-line bg-ds-sunk px-3 py-2"
          />
          <Button type="submit" disabled={!note.trim() || busy} className="!py-2 self-start">
            Add note
          </Button>
        </form>
      ) : null}
      <ul className="mt-3 space-y-2">
        {facts.notes.length === 0 ? <li className="text-ds-ink-soft">No notes.</li> : null}
        {facts.notes.map((n) => (
          <li
            key={n.createdAt + n.body}
            className="rounded-2xl border border-ds-line bg-ds-card p-3"
          >
            <p className="whitespace-pre-wrap text-ds-ink">{n.body}</p>
            <p className="mt-1 text-xs text-ds-ink-soft">
              {n.author} · {new Date(n.createdAt).toLocaleString()}
            </p>
          </li>
        ))}
      </ul>

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
    </section>
  );
}
