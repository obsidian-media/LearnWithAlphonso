import { ticketStatusWord } from "../../../lib/console-format";

const PILL: Record<string, string> = {
  new: "bg-ds-action-tint text-ds-action-text",
  open: "bg-ds-choice-tint text-ds-choice",
  waiting_learner: "border border-ds-line bg-ds-sunk text-ds-ink-soft",
  solved: "bg-ds-right-tint text-ds-right-ink",
};

/** A ticket's status in the console's words: New, Needs reply, Waiting on learner, Resolved. */
export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold normal-case tracking-normal ${PILL[status] ?? PILL.open}`}
    >
      {ticketStatusWord(status)}
    </span>
  );
}

/** A ticket an owner was handed. */
export function UrgentBadge() {
  return (
    <span className="inline-block rounded-md bg-ds-flame-tint px-1.5 py-0.5 text-xs font-extrabold uppercase text-ds-flame">
      Urgent
    </span>
  );
}
