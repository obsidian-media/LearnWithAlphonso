import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  AUDIT_CATEGORIES,
  humanizeAction,
  shortId,
  type AuditTone,
} from "../../../lib/audit-labels";
import { formatDateTime } from "../../../lib/staff-dates";
import { Button } from "../../ui/Button";
import { Figure } from "../Figure";
import type { AuditActor, AuditApi, AuditFilters, AuditRow } from "./auditApi";
import { EMPTY, filtersFor, type Draft } from "./auditFilters";

const messageOf = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback;

const TONE: Record<AuditTone, string> = {
  ok: "bg-ds-right-tint text-ds-right-ink",
  info: "bg-ds-choice-tint text-ds-choice",
  warn: "bg-ds-action-tint text-ds-action-text",
  bad: "bg-ds-wrong-tint text-ds-wrong-ink",
};
const TONE_ICON: Record<AuditTone, string> = {
  ok: "M5 12l5 5L20 7",
  info: "M12 8v5M12 16.5v.01M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0",
  warn: "M12 9v4M12 17h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  bad: "M18 6 6 18M6 6l12 12",
};
const TONE_WORD: Record<AuditTone, string> = {
  ok: "Restored or completed",
  info: "Information",
  warn: "Caution",
  bad: "Serious",
};

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: AuditRow[]; next: number | null };

type Actors = { status: "loading" } | { status: "error" } | { status: "ready"; list: AuditActor[] };

function actorLabel(a: AuditActor): string {
  const name = a.displayName?.trim() || shortId(a.userId) || a.userId;
  const role = a.role === "owner" ? "Owner" : a.role === "support" ? "Support" : a.role;
  return `${name} (${role}${a.disabled ? ", suspended" : ""})`;
}

function Row({ row }: { row: AuditRow }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const label = humanizeAction(row.action);
  const target = row.targetUserId ? (row.targetName ?? shortId(row.targetUserId)) : null;
  // "Banned Sam", but "Dismissed a report · Sam": verbs that take a person read straight on, the rest need a break.
  const join = /^(user|note|pro|support)\./.test(row.action) ? " " : " · ";
  const actor = row.actorName ?? shortId(row.actorUserId);
  const hasDetail = row.before !== null || row.after !== null;
  return (
    <li
      data-audit-row=""
      className="grid gap-1 border-t border-ds-line px-4 py-3 first:border-t-0 md:grid-cols-[9.5rem_minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1.4fr)] md:items-start md:gap-4"
    >
      <p className="font-mono text-xs font-semibold text-ds-ink-faint md:pt-1">
        <time dateTime={row.at}>{formatDateTime(row.at)}</time>
      </p>
      <div className="flex min-w-0 items-start gap-2.5">
        <span
          className={`mt-0.5 inline-grid h-6 w-6 shrink-0 place-items-center rounded-lg ${TONE[label.tone]}`}
          role="img"
          aria-label={TONE_WORD[label.tone]}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <path d={TONE_ICON[label.tone]} />
          </svg>
        </span>
        <p data-audit-sentence="" className="min-w-0 break-words font-semibold text-ds-ink">
          <span data-audit-action="" className={label.known ? "" : "font-mono text-sm"}>
            {label.text}
          </span>
          {target ? (
            <span className="font-medium text-ds-ink-soft">
              {join}
              <span data-audit-target="">{target}</span>
            </span>
          ) : null}
        </p>
      </div>
      <p className="text-sm font-bold text-ds-ink">
        {actor ? (
          <>
            <span data-audit-actor="">{actor}</span>
            <span className="font-semibold text-ds-ink-faint">
              {" "}
              ·{" "}
              {row.actorRole === "owner"
                ? "Owner"
                : row.actorRole === "support"
                  ? "Support"
                  : row.actorRole === "support_ai"
                    ? "Support AI"
                    : row.actorRole}
            </span>
          </>
        ) : (
          <span className="font-semibold text-ds-ink-soft">
            {row.actorRole === "support_ai" ? "Support AI" : "No actor recorded"}
          </span>
        )}
      </p>
      <div className="min-w-0 text-sm">
        {row.reason ? (
          <p className="break-words italic text-ds-ink-soft">{row.reason}</p>
        ) : (
          <p className="italic text-ds-ink-faint">No reason recorded</p>
        )}
        {hasDetail ? (
          <button
            type="button"
            className="mt-1 min-h-11 text-xs font-bold text-ds-choice underline-offset-2 hover:underline md:min-h-0"
            aria-expanded={open}
            aria-controls={panel}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Hide before and after" : "Before and after"}
          </button>
        ) : null}
      </div>
      {open ? (
        <div id={panel} className="grid gap-2 md:col-span-4 md:grid-cols-2">
          {(
            [
              ["Before", row.before],
              ["After", row.after],
            ] as const
          ).map(([title, value]) => (
            <div key={title} className="min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-wider text-ds-ink-soft">
                {title}
              </p>
              <pre
                data-audit-json={title.toLowerCase()}
                className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-ds-sunk p-3 font-mono text-xs text-ds-ink"
              >
                {value === null ? "Nothing recorded" : JSON.stringify(value, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      ) : null}
    </li>
  );
}

/**
 * The Action record: who did what to whom, when and why. Read-only, append-only: nothing here edits or deletes. Every
 * entry comes from the server (names resolved there; the short id when a name is missing), the words for each action
 * come from one total function (an unknown action shows as its raw code), and a failed read says so instead of showing
 * an empty record. Filters (staff person, category, reason or learner id, dates) are applied by the server.
 */
export function AuditScreen({ api }: { api: AuditApi }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [applied, setApplied] = useState<AuditFilters>({});
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [actors, setActors] = useState<Actors>({ status: "loading" });
  const [more, setMore] = useState<{ busy: boolean; error: string | null }>({
    busy: false,
    error: null,
  });
  const seq = useRef(0);

  async function read(filters: AuditFilters) {
    const mine = ++seq.current;
    setApplied(filters);
    setMore({ busy: false, error: null });
    setLoad({ status: "loading" });
    try {
      const page = await api.list(filters);
      if (mine === seq.current)
        setLoad({ status: "ready", rows: page.rows, next: page.nextCursor });
    } catch (e) {
      if (mine === seq.current)
        setLoad({ status: "error", message: messageOf(e, "Could not read the action record.") });
    }
  }

  async function older() {
    if (load.status !== "ready" || load.next === null || more.busy) return;
    const mine = seq.current;
    const cursor = load.next;
    setMore({ busy: true, error: null });
    try {
      const page = await api.list(applied, cursor);
      if (mine !== seq.current) return; // the filters changed while this was loading: drop it
      setLoad({ status: "ready", rows: [...load.rows, ...page.rows], next: page.nextCursor });
      setMore({ busy: false, error: null });
    } catch (e) {
      if (mine === seq.current)
        setMore({ busy: false, error: messageOf(e, "Could not load older entries.") });
    }
  }

  useEffect(() => {
    void read({});
    let live = true;
    api
      .actors()
      .then((list) => live && setActors({ status: "ready", list }))
      .catch(() => live && setActors({ status: "error" }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once
  }, []);

  function change(patch: Partial<Draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    void read(filtersFor(next));
  }
  function search(event: FormEvent) {
    event.preventDefault();
    void read(filtersFor(draft));
  }

  const filtered = Object.keys(applied).length > 0;
  const field =
    "min-h-11 rounded-xl border border-ds-line bg-ds-card px-3 py-2 text-sm font-semibold text-ds-ink";
  const rows = load.status === "ready" ? load.rows : [];

  return (
    <main className="mx-auto max-w-[84rem] p-4 sm:p-6">
      <p className="text-xs font-extrabold uppercase tracking-wider text-ds-ink-soft">
        System · read-only ·{" "}
        <Figure
          value={load.status === "ready" ? rows.length : null}
          reason={load.status === "loading" ? "Loading" : "Could not read"}
        />{" "}
        {load.status === "ready" ? (rows.length === 1 ? "entry shown" : "entries shown") : null}
        {load.status === "ready" && load.next !== null ? " (older entries available)" : null}
      </p>
      <h1 className="font-display text-2xl font-semibold text-ds-ink">Action record</h1>
      <p className="mt-1 max-w-2xl text-sm text-ds-ink-soft">
        Append-only. Every logged action shows who, what, the target and the reason. Nothing here
        can be edited or deleted.
      </p>

      <form onSubmit={search} className="mt-5 flex flex-wrap items-end gap-2" role="search">
        <label className="grid gap-1 text-xs font-bold text-ds-ink-soft">
          Staff
          <select
            className={field}
            value={draft.actor}
            disabled={actors.status !== "ready"}
            onChange={(e) => change({ actor: e.target.value })}
          >
            <option value="">
              {actors.status === "loading"
                ? "Loading staff…"
                : actors.status === "error"
                  ? "Could not read staff"
                  : "All staff"}
            </option>
            {actors.status === "ready"
              ? actors.list.map((a) => (
                  <option key={a.userId} value={a.userId}>
                    {actorLabel(a)}
                  </option>
                ))
              : null}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold text-ds-ink-soft">
          Action
          <select
            className={field}
            value={draft.category}
            onChange={(e) => change({ category: e.target.value })}
          >
            <option value="">All actions</option>
            {AUDIT_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-[12rem] flex-1 gap-1 text-xs font-bold text-ds-ink-soft sm:max-w-sm">
          Find
          <input
            type="search"
            className={field}
            placeholder="Find in reason, or paste a learner id"
            value={draft.text}
            maxLength={100}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          />
        </label>
        <Button type="submit" variant="secondary" className="!px-4 !py-2 text-sm">
          Search
        </Button>
        <label className="grid gap-1 text-xs font-bold text-ds-ink-soft">
          From
          <input
            type="date"
            className={field}
            value={draft.from}
            onChange={(e) => change({ from: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-ds-ink-soft">
          To
          <input
            type="date"
            className={field}
            value={draft.to}
            onChange={(e) => change({ to: e.target.value })}
          />
        </label>
        {filtered ? (
          <Button
            variant="secondary"
            className="!px-4 !py-2 text-sm"
            onClick={() => {
              setDraft(EMPTY);
              void read({});
            }}
          >
            Clear filters
          </Button>
        ) : null}
      </form>
      {actors.status === "error" ? (
        <p role="status" className="mt-2 text-xs font-semibold text-ds-ink-faint">
          The staff list could not be read, so the staff filter is off. The other filters still
          work.
        </p>
      ) : null}

      {load.status === "loading" ? (
        <p role="status" className="mt-6 text-sm font-semibold text-ds-ink-faint">
          Loading the action record…
        </p>
      ) : null}
      {load.status === "error" ? (
        <div className="mt-6 grid gap-2">
          <p role="alert" className="text-sm font-semibold text-ds-wrong-ink">
            {load.message}
          </p>
          <div>
            <Button
              variant="secondary"
              className="!px-4 !py-2 text-sm"
              onClick={() => void read(applied)}
            >
              Try again
            </Button>
          </div>
        </div>
      ) : null}

      {load.status === "ready" ? (
        <>
          <div className="mt-5 overflow-hidden rounded-2xl border border-ds-line bg-ds-card">
            <div
              aria-hidden="true"
              className="hidden border-b border-ds-line px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-ds-ink-soft md:grid md:grid-cols-[9.5rem_minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1.4fr)] md:gap-4"
            >
              <span>When</span>
              <span>Action</span>
              <span>Actor</span>
              <span>Reason</span>
            </div>
            <ul aria-label="Action record">
              {rows.length === 0 ? (
                <li className="px-4 py-4 text-sm font-semibold text-ds-ink-soft">
                  {filtered ? "Nothing matches these filters." : "The action record is empty."}
                </li>
              ) : null}
              {rows.map((r) => (
                <Row key={r.id} row={r} />
              ))}
            </ul>
          </div>
          {more.error ? (
            <p role="alert" className="mt-3 text-sm font-semibold text-ds-wrong-ink">
              {more.error}
            </p>
          ) : null}
          {load.next !== null ? (
            <div className="mt-4">
              <Button
                variant="secondary"
                className="!px-4 !py-2 text-sm"
                disabled={more.busy}
                onClick={() => void older()}
              >
                {more.busy ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
