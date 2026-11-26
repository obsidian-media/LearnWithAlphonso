import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { deleteRehearsal, type Rehearsal } from "@/lib/rehearsal-api";
import {
  EVENT_KIND_LABELS,
  STAGES,
  STAGE_BLURBS,
  STAGE_LABELS,
  type Stage,
} from "@/lib/rehearsal-rules";

const dateText = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

/**
 * The learner's active rehearsal: the event, its date and the three stages, each a live call. Which stage is "next"
 * and which are done comes with run memory (the next slice); here every stage can be started, in any order.
 */
export function ActiveRehearsal({
  rehearsal,
  onDeleted,
}: {
  rehearsal: Rehearsal;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function remove() {
    setBusy(true);
    setFailed(false);
    const result = await deleteRehearsal(rehearsal.id);
    setBusy(false);
    if (result.ok) onDeleted();
    else setFailed(true);
  }

  return (
    <section className="flex flex-col gap-5 px-5 py-6" aria-label="Your rehearsal">
      <div>
        <p className="ds-type-caption font-semibold uppercase tracking-wide text-ds-ink-soft">
          Your rehearsal
        </p>
        <h1 className="font-display ds-type-title font-semibold text-ds-ink">
          {EVENT_KIND_LABELS[rehearsal.eventKind]}
        </h1>
        <p className="mt-1 ds-type-footnote text-ds-ink-soft">
          {rehearsal.eventDate ? dateText(rehearsal.eventDate) : "Date not set yet"}
        </p>
        <p className="mt-2 ds-type-footnote text-ds-ink">{rehearsal.brief.setting}</p>
      </div>

      <ol className="flex flex-col gap-3">
        {STAGES.map((stage: Stage, i) => (
          <li
            key={stage}
            className="flex items-center gap-3 rounded-2xl border border-ds-line bg-ds-card p-4"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ds-sunk ds-type-footnote font-semibold text-ds-ink">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="ds-type-headline font-semibold text-ds-ink">{STAGE_LABELS[stage]}</h2>
              <p className="ds-type-caption text-ds-ink-soft">{STAGE_BLURBS[stage]}</p>
            </div>
            <Link
              to="/rehearse/$id/$stage"
              params={{ id: rehearsal.id, stage }}
              aria-label={`Start ${STAGE_LABELS[stage]}`}
              className="rounded-full bg-ds-brand px-4 py-2 ds-type-footnote font-semibold text-ds-card"
            >
              Start
            </Link>
          </li>
        ))}
      </ol>

      {failed && (
        <p role="alert" className="ds-type-footnote text-rose-700">
          We could not delete it. Please try again.
        </p>
      )}
      {confirming ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="rounded-full border border-rose-300 px-4 py-2 ds-type-footnote font-semibold text-rose-700 disabled:opacity-50"
          >
            Yes, delete it
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="ds-type-footnote text-ds-ink-soft"
          >
            Keep it
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="self-start ds-type-footnote text-ds-ink-soft underline"
        >
          Delete this rehearsal
        </button>
      )}
    </section>
  );
}
