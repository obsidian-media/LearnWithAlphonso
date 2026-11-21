import { useState } from "react";
import type {
  InboxPage,
  TicketAssigned,
  TicketFilter,
  TicketSummary,
} from "../../../lib/staff-support.functions";
import { ticketStatusWord, waitingLabel } from "../../../lib/console-format";
import { TOPIC_LABELS, label } from "../../../lib/support-inbox-copy";
import { Figure } from "../Figure";
import type { HomeApi } from "./homeApi";

type TabKey = "all" | "unassigned" | "mine" | "breaching";

/** What each tab asks the inbox for, and which real count labels it. */
const TABS: {
  key: TabKey;
  label: string;
  query: { filter: TicketFilter; assigned: TicketAssigned };
  count: (c: InboxPage["counts"]) => number | null;
}[] = [
  { key: "all", label: "All", query: { filter: "open", assigned: "any" }, count: (c) => c.open },
  {
    key: "unassigned",
    label: "Unassigned",
    query: { filter: "open", assigned: "unassigned" },
    count: (c) => c.openUnassigned,
  },
  { key: "mine", label: "Mine", query: { filter: "open", assigned: "me" }, count: (c) => c.mine },
  {
    key: "breaching",
    label: "Breaching",
    query: { filter: "breaching", assigned: "any" },
    count: (c) => c.breaching,
  },
];

function Row({
  t,
  now,
  onOpen,
}: {
  t: TicketSummary;
  now: number | null;
  onOpen: (id: string) => void;
}) {
  const wait = now === null ? null : waitingLabel(t.waitingSince, now);
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(t.id)}
        className="grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 border-b border-ds-line px-4 py-3 text-left hover:bg-ds-sunk sm:grid-cols-[auto_1fr_auto_auto_auto]"
      >
        {t.ticketNo !== null ? (
          <span className="hidden font-mono text-xs font-semibold text-ds-ink-faint sm:inline">
            #<Figure value={String(t.ticketNo)} reason="" />
          </span>
        ) : (
          <span className="hidden sm:inline" />
        )}
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ds-ink">
          <span className="truncate">{t.snippet ?? "No message yet"}</span>
          {t.assignedTo === null ? (
            <span className="rounded-md bg-ds-flame-tint px-1.5 py-0.5 text-xs font-extrabold uppercase text-ds-flame">
              Unassigned
            </span>
          ) : null}
        </span>
        <span className="hidden text-xs font-semibold text-ds-ink-soft sm:inline">
          {label(TOPIC_LABELS, t.topic, "Other")}
        </span>
        <span
          className={`text-xs font-bold ${t.breaching ? "text-ds-flame" : "text-ds-ink-soft"}`}
          data-wait=""
        >
          {wait ?? ""}
          {t.breaching ? <span className="sr-only"> (breaching)</span> : null}
        </span>
        <span className="rounded-full bg-ds-choice-tint px-2 py-0.5 text-xs font-bold text-ds-choice">
          {ticketStatusWord(t.status)}
        </span>
      </button>
    </li>
  );
}

/**
 * The support queue card: All / Unassigned / Mine / Breaching, each labelled with its REAL count (a count the inbox
 * could not give is left off, never written as 0). Reads and filters go through the existing inbox function; a row
 * opens the triage drawer. "Breaching" is the support_breach_hours setting the database used, shown in the hint.
 */
export function QueueCard({
  initial,
  api,
  now,
  onOpen,
  refreshKey,
}: {
  initial: InboxPage | null;
  api: HomeApi;
  now: number | null;
  onOpen: (id: string) => void;
  /** Bumped by the screen after a drawer action so the open tab reloads. */
  refreshKey: number;
}) {
  const [tab, setTab] = useState<TabKey>("all");
  const [page, setPage] = useState<InboxPage | null>(initial);
  const [failed, setFailed] = useState(initial === null);
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState(refreshKey);

  async function load(next: TabKey) {
    const def = TABS.find((t) => t.key === next)!;
    setBusy(true);
    try {
      setPage(await api.listTickets(def.query));
      setFailed(false);
      setTab(next);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  // A drawer action changed something: re-read the open tab (and so its counts).
  if (seen !== refreshKey) {
    setSeen(refreshKey);
    void load(tab);
  }

  const counts = page?.counts ?? null;
  return (
    <section
      aria-label="Support queue"
      className="overflow-hidden rounded-2xl border border-ds-line bg-ds-card"
    >
      <div className="flex items-center justify-between gap-2 border-b border-ds-line px-4 py-3">
        <h2 className="text-sm font-bold text-ds-ink">Support queue</h2>
        <a href="/support" className="text-xs font-semibold text-ds-choice">
          Open Support
        </a>
      </div>
      <div
        role="tablist"
        aria-label="Queue"
        className="flex flex-wrap gap-1 border-b border-ds-line p-2"
      >
        {TABS.map((t) => {
          const n = counts ? t.count(counts) : null;
          return (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={tab === t.key}
              onClick={() => void load(t.key)}
              className={`min-h-9 rounded-full px-3 text-xs font-semibold ${
                tab === t.key ? "bg-ds-brand text-ds-on-hero" : "text-ds-ink-soft hover:bg-ds-sunk"
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
      {tab === "breaching" && page?.breachHours != null ? (
        <p className="px-4 pt-2 text-xs text-ds-ink-soft">
          Waiting for a reply longer than <Figure value={page.breachHours} reason="" /> h (the
          support_breach_hours setting).
        </p>
      ) : null}
      {failed ? (
        <p role="alert" className="p-4 text-sm font-semibold text-ds-wrong-ink">
          Could not read the tickets.
        </p>
      ) : page && page.tickets.length === 0 ? (
        <p className="p-6 text-center text-sm font-semibold text-ds-ink-faint">
          No tickets in this view.
        </p>
      ) : (
        <ul aria-busy={busy}>
          {page?.tickets.map((t) => (
            <Row key={t.id} t={t} now={now} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </section>
  );
}
