import { useState } from "react";
import type { Course } from "@/data/course-meta";
import { createRehearsal, type Rehearsal, type RehearsalError } from "@/lib/rehearsal-api";
import { REHEARSAL_ERROR_TEXT } from "@/lib/rehearsal-copy";
import {
  COUNTERPART_PLACEHOLDERS,
  EVENT_KINDS,
  EVENT_KIND_LABELS,
  INTAKE_TEXT_MAX,
  type EventKind,
} from "@/lib/rehearsal-rules";

/**
 * The four intake questions, about 45 seconds: what is coming up, when, who you will talk to, and what worries you.
 * It is a short form, not a chat. The text answers are the learner's own words and stay short (200 characters).
 */
export function RehearsalIntakeForm({
  course,
  onCreated,
}: {
  course: Course;
  onCreated: (rehearsal: Rehearsal) => void;
}) {
  const [kind, setKind] = useState<EventKind | null>(null);
  const [date, setDate] = useState("");
  const [notSure, setNotSure] = useState(false);
  const [counterpart, setCounterpart] = useState("");
  const [worries, setWorries] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<RehearsalError | null>(null);

  const ready = kind !== null && counterpart.trim().length > 0 && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || kind === null) return;
    setBusy(true);
    setError(null);
    const result = await createRehearsal({
      course,
      eventKind: kind,
      eventDate: notSure || date === "" ? null : date,
      counterpart: counterpart.trim(),
      worries: worries.trim() === "" ? null : worries.trim(),
    });
    setBusy(false);
    if (result.ok) onCreated(result.value.rehearsal);
    else setError(result.error);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5 px-5 py-6" aria-label="Plan a rehearsal">
      <div>
        <h1 className="font-display ds-type-title font-semibold text-ds-ink">
          Rehearse a real conversation
        </h1>
        <p className="mt-1 ds-type-footnote text-ds-ink-soft">
          Tell Alphonso what is coming up. You will practise it in three short stages, and Alphonso
          remembers how each one went.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 ds-type-footnote font-semibold text-ds-ink">
          What&apos;s coming up?
        </legend>
        <div className="flex flex-wrap gap-2">
          {EVENT_KINDS.map((k) => (
            <label
              key={k}
              className={`cursor-pointer rounded-full border px-3 py-1.5 ds-type-footnote ${
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

      <div className="flex flex-col gap-2">
        <label htmlFor="rehearsal-date" className="ds-type-footnote font-semibold text-ds-ink">
          When?
        </label>
        <input
          id="rehearsal-date"
          type="date"
          value={date}
          disabled={notSure}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-xl border border-ds-line bg-ds-card px-3 py-2 ds-type-footnote text-ds-ink disabled:opacity-50"
        />
        <label className="flex items-center gap-2 ds-type-footnote text-ds-ink-soft">
          <input type="checkbox" checked={notSure} onChange={(e) => setNotSure(e.target.checked)} />
          Not sure yet
        </label>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="rehearsal-counterpart"
          className="ds-type-footnote font-semibold text-ds-ink"
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
          className="rounded-xl border border-ds-line bg-ds-card px-3 py-2 ds-type-footnote text-ds-ink"
        />
        <p className="ds-type-caption text-ds-ink-soft">
          No need for real names. {counterpart.length}/{INTAKE_TEXT_MAX}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="rehearsal-worries" className="ds-type-footnote font-semibold text-ds-ink">
          What worries you most? (optional)
        </label>
        <textarea
          id="rehearsal-worries"
          value={worries}
          maxLength={INTAKE_TEXT_MAX}
          rows={2}
          onChange={(e) => setWorries(e.target.value)}
          className="rounded-xl border border-ds-line bg-ds-card px-3 py-2 ds-type-footnote text-ds-ink"
        />
        <p className="ds-type-caption text-ds-ink-soft">
          {worries.length}/{INTAKE_TEXT_MAX}
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-300/60 bg-rose-50 px-3 py-2 ds-type-footnote text-rose-700"
        >
          {REHEARSAL_ERROR_TEXT[error]}
        </p>
      )}

      <button
        type="submit"
        disabled={!ready}
        className="rounded-full bg-ds-brand px-5 py-3 font-semibold text-ds-card disabled:opacity-40"
      >
        {busy ? "Preparing…" : "Prepare my rehearsal"}
      </button>
    </form>
  );
}
