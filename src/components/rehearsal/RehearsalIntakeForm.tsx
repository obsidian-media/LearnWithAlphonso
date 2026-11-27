import { useState } from "react";
import type { Course } from "@/data/course-meta";
import {
  adjustRehearsal,
  createRehearsal,
  type Rehearsal,
  type RehearsalError,
} from "@/lib/rehearsal-api";
import { REHEARSAL_ERROR_TEXT } from "@/lib/rehearsal-copy";
import { localToday, shortDay } from "@/lib/rehearsal-dates";
import {
  COUNTERPART_PLACEHOLDERS,
  EVENT_KINDS,
  EVENT_KIND_LABELS,
  INTAKE_TEXT_MAX,
  type EventKind,
} from "@/lib/rehearsal-rules";
import { MonthPicker } from "./MonthPicker";

const STEPS = 4;

/**
 * The intake, stepped: four questions, one per screen, with a progress bar. What is coming up, when, who you will talk
 * to (the "no real names" line sits here, where names might be typed), and what worries you (optional: Skip). The text
 * answers are the learner's own words and stay short (200 characters). With `existing` it re-answers the same four
 * questions for an adjust.
 */
export function RehearsalIntakeForm({
  course,
  existing,
  onCreated,
  onPaywall,
  today = localToday(),
}: {
  course: Course;
  existing?: Rehearsal;
  onCreated: (rehearsal: Rehearsal) => void;
  /** The server says the free rehearsal is used: the page shows the Pro sheet. */
  onPaywall?: () => void;
  /** The learner's calendar day; the first day that can be picked. */
  today?: string;
}) {
  const [step, setStep] = useState(1);
  const [kind, setKind] = useState<EventKind | null>(existing?.eventKind ?? null);
  const [date, setDate] = useState<string | null>(existing?.eventDate ?? null);
  const [notSure, setNotSure] = useState(existing ? existing.eventDate === null : false);
  const [counterpart, setCounterpart] = useState(existing?.counterpart ?? "");
  const [worries, setWorries] = useState(existing?.worries ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<RehearsalError | null>(null);

  const valid =
    step === 1
      ? kind !== null
      : step === 2
        ? notSure || date !== null
        : step === 3
          ? counterpart.trim().length > 0
          : true;

  async function submit(withWorries: boolean) {
    if (kind === null || busy) return;
    setBusy(true);
    setError(null);
    const intake = {
      course,
      eventKind: kind,
      eventDate: notSure ? null : date,
      counterpart: counterpart.trim(),
      worries: withWorries && worries.trim() !== "" ? worries.trim() : null,
    };
    const result = existing
      ? await adjustRehearsal(existing.id, intake)
      : await createRehearsal(intake);
    setBusy(false);
    if (result.ok) return onCreated(result.value.rehearsal);
    setError(result.error);
    if (result.error === "paywall") onPaywall?.();
  }

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="flex flex-col gap-5 px-5 py-6"
      aria-label="Plan a rehearsal"
    >
      <div>
        <p className="ds-type-caption font-semibold uppercase tracking-wide text-ds-ink-soft">
          Rehearse a real conversation
        </p>
        <div
          role="progressbar"
          aria-label="Intake progress"
          aria-valuemin={1}
          aria-valuemax={STEPS}
          aria-valuenow={step}
          className="mt-2 flex gap-1.5"
        >
          {Array.from({ length: STEPS }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-ds-brand" : "bg-ds-sunk"}`}
            />
          ))}
        </div>
        <p className="mt-2 ds-type-caption text-ds-ink-soft">
          Step {step} of {STEPS}
        </p>
      </div>

      {step === 1 && (
        <fieldset className="flex flex-col gap-3">
          <legend className="font-display ds-type-title font-semibold text-ds-ink">
            What is coming up?
          </legend>
          <div className="flex flex-wrap gap-2">
            {EVENT_KINDS.map((k) => (
              <label
                key={k}
                className={`cursor-pointer rounded-full border px-4 py-2.5 ds-type-footnote ${
                  kind === k
                    ? "border-ds-brand bg-ds-brand/10 font-semibold text-ds-brand"
                    : "border-ds-line bg-ds-card text-ds-ink"
                }`}
              >
                <input
                  type="radio"
                  name="event-kind"
                  value={k}
                  checked={kind === k}
                  onChange={() => setKind(k)}
                  className="sr-only"
                />
                {EVENT_KIND_LABELS[k]}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3">
          <h1 className="font-display ds-type-title font-semibold text-ds-ink">When is it?</h1>
          <p className="ds-type-footnote text-ds-ink-soft">
            {notSure ? "Not sure yet" : date ? shortDay(date) : "Pick a day"}
          </p>
          <MonthPicker
            value={notSure ? null : date}
            min={today}
            onChange={(d) => {
              setDate(d);
              setNotSure(false);
            }}
          />
          <button
            type="button"
            aria-pressed={notSure}
            onClick={() => {
              setNotSure(true);
              setDate(null);
            }}
            className={`self-start rounded-full border px-4 py-2 ds-type-footnote ${
              notSure
                ? "border-ds-brand bg-ds-brand/10 font-semibold text-ds-brand"
                : "border-ds-line bg-ds-card text-ds-ink"
            }`}
          >
            Not sure yet
          </button>
          <p className="ds-type-caption text-ds-ink-soft">
            If you are not sure, the plan still works. Alphonso offers a stage every other day.
          </p>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-2">
          <label
            htmlFor="rehearsal-counterpart"
            className="font-display ds-type-title font-semibold text-ds-ink"
          >
            Who will you be talking to?
          </label>
          <input
            id="rehearsal-counterpart"
            type="text"
            value={counterpart}
            maxLength={INTAKE_TEXT_MAX}
            onChange={(e) => setCounterpart(e.target.value)}
            placeholder={
              kind ? COUNTERPART_PLACEHOLDERS[kind] : "e.g. a hiring manager at a hospital"
            }
            className="rounded-xl border border-ds-line bg-ds-card px-3 py-3 ds-type-footnote text-ds-ink"
          />
          <p className="ds-type-caption text-ds-ink-soft">
            Up to {INTAKE_TEXT_MAX} characters. {counterpart.length}/{INTAKE_TEXT_MAX}
          </p>
          <p className="rounded-xl bg-ds-sunk px-3 py-2 ds-type-footnote text-ds-ink">
            No need for real names. Say &ldquo;my manager&rdquo; or &ldquo;the landlord&rdquo;. What
            you write here is only used to build your rehearsal, and you can delete it any time.
          </p>
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col gap-2">
          <label
            htmlFor="rehearsal-worries"
            className="font-display ds-type-title font-semibold text-ds-ink"
          >
            What worries you most? <span className="ds-type-footnote font-normal">(optional)</span>
          </label>
          <textarea
            id="rehearsal-worries"
            value={worries}
            maxLength={INTAKE_TEXT_MAX}
            rows={3}
            onChange={(e) => setWorries(e.target.value)}
            className="rounded-xl border border-ds-line bg-ds-card px-3 py-3 ds-type-footnote text-ds-ink"
          />
          <p className="ds-type-caption text-ds-ink-soft">
            For example: a type of question, understanding fast speech, your accent.{" "}
            {worries.length}/{INTAKE_TEXT_MAX}
          </p>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-300/60 bg-rose-50 px-3 py-2 ds-type-footnote text-rose-700"
        >
          {REHEARSAL_ERROR_TEXT[error]}
        </p>
      )}

      <div className="flex items-center gap-3">
        {step > 1 && (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            disabled={busy}
            className="rounded-full border border-ds-line px-5 py-3 font-semibold text-ds-ink"
          >
            Back
          </button>
        )}
        {step < STEPS ? (
          <button
            type="button"
            disabled={!valid}
            onClick={() => setStep(step + 1)}
            className="flex-1 rounded-full bg-ds-brand px-5 py-3 font-semibold text-ds-card disabled:opacity-40"
          >
            Next
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit(true)}
              className="flex-1 rounded-full bg-ds-brand px-5 py-3 font-semibold text-ds-card disabled:opacity-40"
            >
              {busy ? "Preparing…" : "Make my plan"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit(false)}
              className="min-h-11 min-w-11 rounded-full px-3 py-3 ds-type-footnote font-semibold text-ds-ink-soft"
            >
              Skip
            </button>
          </>
        )}
      </div>
    </form>
  );
}
