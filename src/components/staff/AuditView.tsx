import { useState, type FormEvent } from "react";
import { Button } from "../ui/Button";
import type { AuditRow } from "../../lib/staff-audit.functions";

export type AuditFilters = {
  actor?: string;
  target?: string;
  action?: string;
  from?: string;
  to?: string;
};

const short = (id: string | null) => (id ? `${id.slice(0, 8)}…` : "—");

/** The action record: who did what to whom, when and why. Read-only; there is no edit or delete anywhere. */
export function AuditView({
  rows,
  nextCursor,
  error,
  busy,
  onFilter,
  onMore,
}: {
  rows: AuditRow[];
  nextCursor: number | null;
  error: string | null;
  busy: boolean;
  onFilter: (filters: AuditFilters) => void;
  onMore: () => void;
}) {
  const [f, setF] = useState({ actor: "", target: "", action: "", from: "", to: "" });
  function submit(event: FormEvent) {
    event.preventDefault();
    const clean: AuditFilters = {};
    if (f.actor.trim()) clean.actor = f.actor.trim();
    if (f.target.trim()) clean.target = f.target.trim();
    if (f.action.trim()) clean.action = f.action.trim();
    if (f.from) clean.from = new Date(`${f.from}T00:00:00Z`).toISOString();
    if (f.to) clean.to = new Date(`${f.to}T23:59:59Z`).toISOString();
    onFilter(clean);
  }
  const input = "min-h-11 rounded-xl border border-ds-line bg-ds-sunk px-3 py-2";
  return (
    <section>
      <h1 className="font-display text-2xl font-semibold text-ds-ink">Action record</h1>
      <p className="ds-type-footnote mt-1 text-ds-ink-soft">
        Append-only. Every staff action and every look at a learner is here.
      </p>
      <form onSubmit={submit} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <input
          className={input}
          aria-label="Actor id"
          placeholder="actor user id"
          value={f.actor}
          onChange={(e) => setF({ ...f, actor: e.target.value })}
        />
        <input
          className={input}
          aria-label="Target id"
          placeholder="learner user id"
          value={f.target}
          onChange={(e) => setF({ ...f, target: e.target.value })}
        />
        <input
          className={input}
          aria-label="Action"
          placeholder="action, e.g. user.ban"
          value={f.action}
          onChange={(e) => setF({ ...f, action: e.target.value })}
        />
        <label className="text-sm text-ds-ink-soft">
          From
          <input
            type="date"
            className={`${input} mt-1 w-full`}
            value={f.from}
            onChange={(e) => setF({ ...f, from: e.target.value })}
          />
        </label>
        <label className="text-sm text-ds-ink-soft">
          To
          <input
            type="date"
            className={`${input} mt-1 w-full`}
            value={f.to}
            onChange={(e) => setF({ ...f, to: e.target.value })}
          />
        </label>
        <div className="self-end">
          <Button type="submit" disabled={busy} className="!py-2">
            Filter
          </Button>
        </div>
      </form>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-ember">
          {error}
        </p>
      ) : null}
      <div className="mt-5 overflow-x-auto rounded-2xl border border-ds-line bg-ds-card">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-ds-line text-xs uppercase tracking-wider text-ds-ink-soft">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Who</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Learner</th>
              <th className="px-3 py-2">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ds-line">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-ds-ink-soft">
                  Nothing matches.
                </td>
              </tr>
            ) : null}
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="whitespace-nowrap px-3 py-2">{new Date(r.at).toLocaleString()}</td>
                <td className="px-3 py-2">
                  {r.actorRole} <span className="text-ds-ink-soft">{short(r.actorUserId)}</span>
                </td>
                <td className="px-3 py-2 font-medium">{r.action}</td>
                <td className="px-3 py-2 text-ds-ink-soft">{short(r.targetUserId)}</td>
                <td className="px-3 py-2">{r.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nextCursor ? (
        <div className="mt-4">
          <Button variant="secondary" onClick={onMore} disabled={busy} className="!py-2">
            Older
          </Button>
        </div>
      ) : null}
    </section>
  );
}
