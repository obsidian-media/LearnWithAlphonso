import { Button } from "../ui/Button";
import type {
  InboxPage,
  TicketAssigned,
  TicketFilter,
  TicketSummary,
} from "../../lib/staff-support.functions";
import {
  CHANNEL_LABELS,
  FILTERS,
  HANDOFF_LABELS,
  STATUS_LABELS,
  TOPIC_LABELS,
  ageLabel,
  assigneeLabel,
  label,
} from "../../lib/support-inbox-copy";

const PILL: Record<string, string> = {
  new: "bg-ds-action-tint text-ds-action-text",
  open: "bg-ds-choice-tint text-ds-choice",
  waiting_learner: "border border-ds-line bg-ds-sunk text-ds-ink-soft",
  solved: "bg-ds-right-tint text-ds-right-ink",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-lg px-2 py-0.5 text-xs font-extrabold ${PILL[status] ?? PILL.open}`}
    >
      {label(STATUS_LABELS, status, status)}
    </span>
  );
}

function Chip({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count?: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold ${
        active
          ? "border-ds-ink bg-ds-ink text-ds-card"
          : "border-ds-line bg-ds-card text-ds-ink-soft hover:bg-ds-sunk"
      }`}
    >
      {children}
      {count !== undefined ? (
        <em
          className={`rounded-full px-1.5 text-xs font-extrabold not-italic ${
            active ? "bg-white/20 text-ds-card" : "bg-ds-sunk text-ds-ink-soft"
          }`}
        >
          {count}
        </em>
      ) : null}
    </button>
  );
}

function Row({ t, me }: { t: TicketSummary; me: string }) {
  const meta = [
    label(CHANNEL_LABELS, t.channel),
    label(HANDOFF_LABELS, t.handoffReason),
    ageLabel(t.updatedAt),
  ]
    .filter(Boolean)
    .join(" · ");
  const owner = assigneeLabel(t, me);
  return (
    <li className="border-t border-ds-line first:border-t-0">
      <a
        href={`/support/${t.id}`}
        className="grid gap-1 px-4 py-3 hover:bg-ds-sunk sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-center sm:gap-4"
      >
        <span className="flex items-center gap-2">
          <StatusPill status={t.status} />
          <span className="text-sm font-extrabold text-ds-ink sm:hidden">
            {label(TOPIC_LABELS, t.topic, "Other")}
          </span>
          {t.unopened ? (
            <span
              role="img"
              aria-label="Not opened yet"
              title="Not opened yet"
              className="inline-block size-2.5 rounded-full bg-ds-choice sm:hidden"
            />
          ) : null}
          <span className="ml-auto text-xs font-semibold text-ds-ink-soft sm:hidden">
            {ageLabel(t.updatedAt)}
          </span>
        </span>
        <span className="min-w-0">
          <span className="hidden items-center gap-1.5 text-sm font-extrabold text-ds-ink sm:flex">
            {label(TOPIC_LABELS, t.topic, "Other")}
            {t.unopened ? (
              <span
                role="img"
                aria-label="Not opened yet"
                title="Not opened yet"
                className="inline-block size-2.5 rounded-full bg-ds-choice"
              />
            ) : null}
          </span>
          {/* Learner text is plain text: React escapes it, and it is never rendered as markup. */}
          <span
            className={`block text-sm text-ds-ink max-sm:line-clamp-2 sm:truncate ${t.unopened ? "font-extrabold" : ""}`}
          >
            {t.snippet ?? "(no message yet)"}
          </span>
          <span className="mt-0.5 block text-xs font-semibold text-ds-ink-soft">
            {meta}
            <span className="sm:hidden"> · {owner}</span>
          </span>
        </span>
        <span
          className={`hidden text-right text-sm font-bold sm:block ${t.assignedTo ? "text-ds-ink-soft" : "text-ds-ink-faint"}`}
        >
          {owner}
        </span>
      </a>
    </li>
  );
}

/** The support inbox: filters, the list (no learner name or email), and paging. */
export function TicketList({
  page,
  filter,
  assigned,
  busy,
  error,
  onFilter,
  onMore,
}: {
  page: InboxPage;
  filter: TicketFilter;
  assigned: TicketAssigned;
  busy: boolean;
  error: string | null;
  onFilter: (filter: TicketFilter, assigned: TicketAssigned) => void;
  onMore: () => void;
}) {
  const counts = page.counts as Record<string, number>;
  return (
    <section>
      <h1 className="font-display text-2xl font-semibold text-ds-ink">Support</h1>
      <p className="ds-type-footnote mt-1 text-ds-ink-soft">
        Conversations from the Help chat. Learner text is shown as plain text. Opening a ticket is
        recorded in the action record.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
        {FILTERS.map((f) => (
          <Chip
            key={f.key}
            active={filter === f.key}
            count={f.key === "all" ? undefined : counts[f.key]}
            onClick={() => onFilter(f.key, assigned)}
          >
            {f.label}
          </Chip>
        ))}
        <span aria-hidden className="mx-1 hidden h-5 w-px bg-ds-line sm:block" />
        <Chip
          active={assigned === "me"}
          onClick={() => onFilter(filter, assigned === "me" ? "any" : "me")}
        >
          Assigned to me
        </Chip>
        <Chip
          active={assigned === "unassigned"}
          count={counts.unassigned}
          onClick={() => onFilter(filter, assigned === "unassigned" ? "any" : "unassigned")}
        >
          Unassigned
        </Chip>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-ember">
          {error}
        </p>
      ) : null}
      {page.tickets.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-ds-line bg-ds-card px-4 py-8 text-center">
          <p className="font-display text-lg font-extrabold text-ds-ink">No tickets here</p>
          <p className="ds-type-footnote text-ds-ink-soft">
            Nothing is waiting on you in this filter.
          </p>
        </div>
      ) : (
        <ul
          aria-label="Tickets"
          className="mt-4 overflow-hidden rounded-2xl border border-ds-line bg-ds-card"
        >
          {page.tickets.map((t) => (
            <Row key={t.id} t={t} me={page.me} />
          ))}
        </ul>
      )}
      {page.tickets.length > 0 ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold text-ds-ink-soft">
            Showing {page.tickets.length} of {page.total}. 25 per page.
          </span>
          {page.next ? (
            <Button
              variant="secondary"
              className="!min-h-9 !px-3 !py-1 text-sm"
              disabled={busy}
              onClick={onMore}
            >
              {busy ? "Loading…" : "Load more"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
