import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { AiLabel } from "@/components/AiLabel";
import { deleteRehearsal, type Rehearsal } from "@/lib/rehearsal-api";
import { daysToGoText, localToday, shortDay } from "@/lib/rehearsal-dates";
import {
  EVENT_KIND_LABELS,
  STAGES,
  STAGE_BLURBS,
  STAGE_LABELS,
  STAGE_MINUTES,
  type Stage,
  type StageProgress,
} from "@/lib/rehearsal-rules";

/**
 * "Your rehearsal plan": the event, its date, the three stages as rows (a tick for a done one, which can be repeated)
 * and ONE primary button, the server's next stage. Adjust and Delete are quiet. Alphonso is always labelled an AI and
 * nothing here is a score.
 */
export function ActiveRehearsal({
  rehearsal,
  progress,
  nextStage,
  onDeleted,
  onAdjust,
  today = localToday(),
}: {
  rehearsal: Rehearsal;
  progress: StageProgress | null;
  nextStage: Stage | null;
  onDeleted: () => void;
  onAdjust: () => void;
  today?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const next = nextStage ?? "warmup";

  async function remove() {
    setBusy(true);
    setFailed(false);
    const result = await deleteRehearsal(rehearsal.id);
    setBusy(false);
    if (result.ok) onDeleted();
    else setFailed(true);
  }

  return (
    <section className="flex flex-col gap-5 px-5 py-6" aria-label="Your rehearsal plan">
      <div className="rounded-3xl bg-ds-hero px-5 py-5 text-ds-on-hero">
        <p className="ds-type-caption font-semibold uppercase tracking-wide text-ds-on-hero-kick">
          Your rehearsal plan
        </p>
        <h1 className="mt-1 font-display ds-type-title font-semibold">
          {EVENT_KIND_LABELS[rehearsal.eventKind]}
        </h1>
        <p className="mt-1 ds-type-footnote text-ds-on-hero-soft">
          {rehearsal.eventDate
            ? `${shortDay(rehearsal.eventDate)} · ${daysToGoText(rehearsal.eventDate, today)}`
            : "Date not set yet"}
        </p>
        <p className="mt-2 ds-type-footnote text-ds-on-hero-soft">With {rehearsal.counterpart}</p>
      </div>

      <ol className="flex flex-col gap-3">
        {STAGES.map((stage, i) => {
          const done = progress?.[stage] === "done";
          const isNext = stage === next;
          return (
            <li
              key={stage}
              className={`flex items-center gap-3 rounded-2xl border p-4 ${
                done ? "border-ds-right bg-ds-right-tint" : "border-ds-line bg-ds-card"
              }`}
            >
              <span
                aria-hidden="true"
                className={`grid size-8 shrink-0 place-items-center rounded-full ds-type-footnote font-semibold ${
                  done ? "bg-ds-right text-ds-on-right" : "bg-ds-sunk text-ds-ink"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="ds-type-headline font-semibold text-ds-ink">
                  {STAGE_LABELS[stage]}
                </h2>
                <p className="ds-type-caption text-ds-ink-soft">
                  {done
                    ? "Done · you can repeat it"
                    : `${STAGE_BLURBS[stage]} · about ${STAGE_MINUTES[stage]} min`}
                </p>
              </div>
              {isNext && !done && (
                <span className="rounded-full bg-ds-choice-tint px-2 py-0.5 ds-type-caption font-semibold text-ds-brand">
                  Next
                </span>
              )}
              <Link
                to="/rehearse/$id/$stage"
                params={{ id: rehearsal.id, stage }}
                aria-label={`${done ? "Repeat" : "Start"} ${STAGE_LABELS[stage]}`}
                className="rounded-full border border-ds-line px-3 py-1.5 ds-type-footnote font-semibold text-ds-ink"
              >
                {done ? "Repeat" : "Start"}
              </Link>
            </li>
          );
        })}
      </ol>

      <Link
        to="/rehearse/$id/$stage"
        params={{ id: rehearsal.id, stage: next }}
        className="rounded-full bg-ds-brand px-5 py-3 text-center font-semibold text-ds-card"
      >
        Next: {STAGE_LABELS[next]}
      </Link>

      <p className="flex items-start gap-2 ds-type-caption text-ds-ink-soft">
        <AiLabel className="mt-0.5" />
        <span>
          Alphonso is an AI. He remembers what happened on each run and opens the next one with it.
          There is no readiness score.
        </span>
      </p>

      {failed && (
        <p role="alert" className="ds-type-footnote text-ds-wrong-ink">
          We could not delete it. Please try again.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={onAdjust}
          className="ds-type-footnote font-semibold text-ds-ink-soft underline"
        >
          Adjust
        </button>
        {confirming ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="rounded-full border border-ds-wrong px-4 py-2 ds-type-footnote font-semibold text-ds-wrong-ink disabled:opacity-50"
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
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="ds-type-footnote text-ds-ink-soft underline"
          >
            Delete this rehearsal
          </button>
        )}
      </div>
    </section>
  );
}
