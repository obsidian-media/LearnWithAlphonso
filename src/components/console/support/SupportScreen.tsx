import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  InboxPage,
  TicketAssigned,
  TicketFilter,
  TicketSummary,
} from "../../../lib/staff-support.functions";
import { waitingLabel } from "../../../lib/console-format";
import { TOPIC_LABELS, label } from "../../../lib/support-inbox-copy";
import { Figure } from "../Figure";
import { useNow } from "../useNow";
import { MIN_REASON } from "../../staff/ReasonDialog";
import { StatusPill, UrgentBadge } from "./StatusPill";
import { TicketPane } from "./TicketPane";
import type { SupportApi } from "./supportApi";

export type SupportMe = { displayName: string | null; role: string; scopes: readonly string[] };

type StatusTab = {
  key: string;
  label: string;
  filter: TicketFilter;
  count: (c: InboxPage["counts"]) => number | null;
};
/** Each tab asks the inbox for one filter and is labelled with its REAL count (a count it could not give is left off). */
const STATUS_TABS: StatusTab[] = [
  { key: "open", label: "Needs reply", filter: "open", count: (c) => c.open },
  { key: "breaching", label: "Breaching", filter: "breaching", count: (c) => c.breaching },
  { key: "waiting", label: "Waiting on learner", filter: "waiting", count: (c) => c.waiting },
  { key: "solved", label: "Resolved", filter: "solved", count: (c) => c.solved },
  { key: "all", label: "All", filter: "all", count: (c) => c.all },
];
const ASSIGNED: { key: TicketAssigned; label: string }[] = [
  { key: "any", label: "Anyone" },
  { key: "me", label: "Mine" },
  { key: "unassigned", label: "Unassigned" },
];

function Row({
  t,
  now,
  me,
  selected,
  onOpen,
}: {
  t: TicketSummary;
  now: number | null;
  me: string;
  selected: boolean;
  onOpen: (id: string) => void;
}) {
  const wait = now === null ? null : waitingLabel(t.waitingSince, now);
  const owner =
    t.assignedTo === null ? null : t.assignedTo === me ? "You" : (t.assignedName ?? "Staff");
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(t.id)}
        aria-current={selected ? "true" : undefined}
        className={`grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 border-b border-ds-line px-4 py-3 text-left hover:bg-ds-sunk ${
          selected ? "bg-ds-sunk" : ""
        }`}
      >
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ds-ink">
          {t.unopened ? (
            <span
              role="img"
              aria-label="Not opened yet"
              className="inline-block h-2 w-2 flex-none rounded-full bg-ds-choice"
            />
          ) : null}
          {t.ticketNo !== null ? (
            <span className="font-mono text-xs font-semibold text-ds-ink-faint">
              #<Figure value={String(t.ticketNo)} reason="" />
            </span>
          ) : null}
          <span className={`truncate ${t.unopened ? "font-extrabold" : ""}`}>
            {t.snippet ?? "No message yet"}
          </span>
        </span>
        <span
          data-wait=""
          className={`text-right text-xs font-bold ${t.breaching ? "text-ds-flame" : "text-ds-ink-soft"}`}
        >
          {wait ?? ""}
          {t.breaching ? <span className="sr-only"> (breaching)</span> : null}
        </span>
        <span className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-ds-ink-soft">
          <span>{label(TOPIC_LABELS, t.topic, "Other")}</span>
          {t.urgent ? <UrgentBadge /> : null}
          {owner === null ? (
            <span className="rounded-md bg-ds-flame-tint px-1.5 py-0.5 text-xs font-extrabold uppercase text-ds-flame">
              Unassigned
            </span>
          ) : (
            <span>{owner}</span>
          )}
        </span>
        <StatusPill status={t.status} />
      </button>
    </li>
  );
}

/** The owner's control for the breach clock: hours (1 to 168) and a reason, both kept in the action record. */
function BreachHoursDialog({
  current,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  current: number | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (hours: number, reason: string) => void;
}) {
  const [hours, setHours] = useState(current === null ? "" : String(current));
  const [reason, setReason] = useState("");
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);
  const n = Number(hours);
  const hoursOk = hours.trim() !== "" && Number.isInteger(n) && n >= 1 && n <= 168;
  const ready = hoursOk && reason.trim().length >= MIN_REASON;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (ready && !busy) onSubmit(n, reason.trim());
  }
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Breach time"
      className="fixed inset-0 z-50 flex items-end justify-center bg-ds-ink/40 p-4 sm:items-center"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-3 rounded-3xl border border-ds-line bg-ds-card p-5 shadow-lg"
      >
        <h2 className="ds-type-title text-ds-ink">Breach time</h2>
        <p className="text-sm text-ds-ink-soft">
          A ticket that needs a reply counts as breaching when nobody has answered it for longer
          than this.
        </p>
        <label className="block text-sm font-semibold text-ds-ink">
          Hours (1 to 168)
          <input
            ref={first}
            type="number"
            inputMode="numeric"
            min={1}
            max={168}
            step={1}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="mt-1 w-full rounded-xl border border-ds-line bg-ds-sunk px-3 py-2 font-normal"
          />
        </label>
        <label className="block text-sm font-semibold text-ds-ink">
          Reason (3 to 500 characters, kept in the action record)
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            className="mt-1 w-full rounded-xl border border-ds-line bg-ds-sunk px-3 py-2 font-normal"
          />
        </label>
        {error ? (
          <p role="alert" className="text-sm font-semibold text-ds-wrong-ink">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-11 rounded-xl border border-ds-line px-4 text-sm font-bold text-ds-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!ready || busy}
            className="min-h-11 rounded-xl bg-ds-brand px-4 text-sm font-bold text-ds-on-hero disabled:opacity-50"
          >
            {busy ? "Working…" : "Save and log"}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * The Support screen: the queue on the left (status tabs, who-has-it filter, the real counts, paging) and the ticket on
 * the right; on a phone the list, then the ticket with a back arrow. Every number goes through <Figure>: no value
 * says why, never a 0. The owner also gets the breach-time control. Nothing here is live: it reads when it loads and
 * after each action.
 */
export function SupportScreen({
  me,
  initial,
  api,
  selectedId,
  onSelect,
}: {
  me: SupportMe;
  initial: InboxPage | null;
  api: SupportApi;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const now = useNow(30_000);
  const [page, setPage] = useState<InboxPage | null>(initial);
  const [failed, setFailed] = useState(initial === null);
  const [tab, setTab] = useState<StatusTab>(STATUS_TABS[0]!);
  const [assigned, setAssigned] = useState<TicketAssigned>("any");
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const isOwner = me.role === "owner" && me.scopes.includes("staff.manage");
  const counts = page?.counts ?? null;

  async function load(next: StatusTab, nextAssigned: TicketAssigned, append: boolean) {
    setBusy(true);
    try {
      const result = await api.listTickets({
        filter: next.filter,
        assigned: nextAssigned,
        cursor: append ? (page?.next ?? undefined) : undefined,
      });
      setPage(
        append && page ? { ...result, tickets: [...page.tickets, ...result.tickets] } : result,
      );
      setFailed(false);
      setTab(next);
      setAssigned(nextAssigned);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function saveBreachHours(hours: number, reason: string) {
    setSettingsBusy(true);
    setSettingsError(null);
    try {
      await api.setBreachHours(hours, reason);
      setSettingsOpen(false);
      setNotice("Breach time saved.");
      await load(tab, assigned, false);
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : "Could not change the setting.");
    } finally {
      setSettingsBusy(false);
    }
  }

  const meId = page?.me ?? "";
  return (
    <main className="mx-auto flex max-w-[84rem] flex-col p-4 sm:p-6 lg:h-dvh">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ds-ink">Support</h1>
          <p data-support-sub="" className="mt-1 text-sm text-ds-ink-soft">
            <Figure value={counts?.open} reason="Could not read" /> need a reply ·{" "}
            <Figure value={counts?.openUnassigned} reason="Could not read" /> unassigned ·{" "}
            <Figure
              value={counts?.breaching}
              reason={page?.breachHours == null ? "No breach time set" : "Could not read"}
            />{" "}
            breaching
            {isOwner && counts ? (
              <>
                {" · "}
                <Figure value={counts.urgent} reason="Could not read" /> urgent
              </>
            ) : null}
          </p>
        </div>
        {isOwner ? (
          <button
            type="button"
            onClick={() => {
              setSettingsError(null);
              setSettingsOpen(true);
            }}
            className="min-h-11 rounded-xl border border-ds-line bg-ds-card px-3 text-sm font-bold text-ds-ink"
          >
            Breach time: <Figure value={page?.breachHours} kind="number" reason="not set" />
            {page?.breachHours != null ? " h" : ""}
          </button>
        ) : null}
      </div>
      {notice ? (
        <p role="status" className="mt-2 text-sm font-semibold text-ds-ink">
          {notice}
        </p>
      ) : null}

      <div className="mt-4 grid min-h-0 flex-1 gap-4 lg:grid-cols-[24rem_minmax(0,1fr)]">
        <section
          aria-label="Ticket list"
          className={`min-h-0 flex-col overflow-hidden rounded-2xl border border-ds-line bg-ds-card ${
            selectedId ? "hidden lg:flex" : "flex"
          }`}
        >
          <div
            role="tablist"
            aria-label="Status"
            className="flex flex-wrap gap-1 border-b border-ds-line p-2"
          >
            {STATUS_TABS.map((t) => {
              const n = counts ? t.count(counts) : null;
              return (
                <button
                  key={t.key}
                  role="tab"
                  type="button"
                  aria-selected={tab.key === t.key}
                  onClick={() => void load(t, assigned, false)}
                  className={`min-h-9 rounded-full px-3 text-xs font-semibold ${
                    tab.key === t.key
                      ? "bg-ds-brand text-ds-on-hero"
                      : "text-ds-ink-soft hover:bg-ds-sunk"
                  }`}
                >
                  {t.label}
                  {n !== null ? (
                    <>
                      {" "}
                      <Figure value={n} reason="" />
                    </>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div
            role="group"
            aria-label="Who has it"
            className="flex flex-wrap gap-1 border-b border-ds-line px-2 py-1.5"
          >
            {ASSIGNED.map((a) => {
              const n =
                tab.key === "open" && counts
                  ? a.key === "me"
                    ? counts.mine
                    : a.key === "unassigned"
                      ? counts.openUnassigned
                      : null
                  : null;
              return (
                <button
                  key={a.key}
                  type="button"
                  aria-pressed={assigned === a.key}
                  onClick={() => void load(tab, a.key, false)}
                  className={`min-h-9 rounded-full border px-3 text-xs font-semibold ${
                    assigned === a.key
                      ? "border-ds-ink bg-ds-ink text-ds-card"
                      : "border-ds-line text-ds-ink-soft hover:bg-ds-sunk"
                  }`}
                >
                  {a.label}
                  {n !== null ? (
                    <>
                      {" "}
                      <Figure value={n} reason="" />
                    </>
                  ) : null}
                </button>
              );
            })}
          </div>
          {tab.key === "breaching" && page?.breachHours != null ? (
            <p className="px-4 pt-2 text-xs text-ds-ink-soft">
              Waiting for a reply longer than <Figure value={page.breachHours} reason="" /> h (the
              support_breach_hours setting).
            </p>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={busy}>
            {failed ? (
              <p role="alert" className="p-4 text-sm font-semibold text-ds-wrong-ink">
                Could not read the tickets.
              </p>
            ) : page && page.tickets.length === 0 ? (
              <p className="p-6 text-center text-sm font-semibold text-ds-ink-faint">
                Nothing here. You're all caught up.
              </p>
            ) : (
              <ul>
                {page?.tickets.map((t) => (
                  <Row
                    key={t.id}
                    t={t}
                    now={now}
                    me={meId}
                    selected={t.id === selectedId}
                    onOpen={onSelect}
                  />
                ))}
              </ul>
            )}
            {page?.next ? (
              <div className="p-3 text-center">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void load(tab, assigned, true)}
                  className="min-h-11 rounded-xl border border-ds-line px-4 text-sm font-bold text-ds-ink disabled:opacity-50"
                >
                  Load more
                </button>
              </div>
            ) : null}
          </div>
        </section>

        <div
          className={`min-h-0 flex-col overflow-hidden rounded-2xl border border-ds-line bg-ds-card ${
            selectedId ? "flex" : "hidden lg:flex"
          }`}
        >
          {selectedId ? (
            <TicketPane
              key={selectedId}
              ticketId={selectedId}
              scopes={me.scopes}
              role={me.role}
              api={api}
              now={now}
              onBack={() => onSelect(null)}
              onChanged={() => void load(tab, assigned, false)}
            />
          ) : (
            <p className="m-auto p-6 text-sm font-semibold text-ds-ink-faint">
              Pick a ticket to read it.
            </p>
          )}
        </div>
      </div>

      {settingsOpen ? (
        <BreachHoursDialog
          current={page?.breachHours ?? null}
          busy={settingsBusy}
          error={settingsError}
          onCancel={() => setSettingsOpen(false)}
          onSubmit={(h, r) => void saveBreachHours(h, r)}
        />
      ) : null}
    </main>
  );
}
