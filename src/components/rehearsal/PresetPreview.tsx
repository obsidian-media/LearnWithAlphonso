import { useEffect, useRef, useState } from "react";
import type { Course } from "@/data/course-meta";
import {
  createRehearsalFromPreset,
  type Rehearsal,
  type RehearsalError,
} from "@/lib/rehearsal-api";
import { REHEARSAL_ERROR_TEXT } from "@/lib/rehearsal-copy";
import { localToday, shortDay } from "@/lib/rehearsal-dates";
import type { PresetSummary } from "@/lib/rehearsal-presets";
import { STAGE_LABELS } from "@/lib/rehearsal-rules";
import { MonthPicker } from "./MonthPicker";
import { PresetIcon } from "./QuickStartPicker";

/**
 * What a ready-made rehearsal holds: the three stages, an optional date, and two choices. "Start now" makes the
 * rehearsal as it is (no model call); "Personalise" makes it and then opens the same four questions as Adjust, so the
 * learner's own answers replace the ready-made brief.
 */
export function PresetPreview({
  course,
  preset,
  today = localToday(),
  onBack,
  onCreated,
  onPaywall,
}: {
  course: Course;
  preset: PresetSummary;
  today?: string;
  onBack: () => void;
  /** `personalise` is true when the learner chose Personalise: the page then opens the four questions. */
  onCreated: (rehearsal: Rehearsal, personalise: boolean) => void;
  onPaywall?: () => void;
}) {
  const [date, setDate] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<RehearsalError | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const dateToggle = useRef<HTMLButtonElement>(null);

  // Arriving here from the picker moves focus to the new heading, so a screen reader starts at the top of it.
  useEffect(() => heading.current?.focus(), []);

  async function go(personalise: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await createRehearsalFromPreset(course, preset.id, date);
    setBusy(false);
    if (result.ok) return onCreated(result.value.rehearsal, personalise);
    setError(result.error);
    if (result.error === "paywall") onPaywall?.();
  }

  return (
    <section className="flex flex-col gap-4 px-5 py-6" aria-label={preset.title}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="min-h-11 min-w-11 rounded-full px-2 ds-type-footnote font-semibold text-ds-ink-soft"
        >
          Back to rehearsals
        </button>
        <h1
          ref={heading}
          tabIndex={-1}
          className="font-display ds-type-title font-semibold text-ds-ink outline-none"
        >
          {preset.title}
        </h1>
      </div>

      <div className="flex items-center gap-3 rounded-2xl bg-ds-brand/10 p-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-ds-card text-ds-brand">
          <PresetIcon id={preset.id} size={24} />
        </span>
        <div>
          <p className="ds-type-caption font-semibold uppercase tracking-wide text-ds-ink-soft">
            Ready-made rehearsal
          </p>
          <p className="ds-type-footnote text-ds-ink">{preset.blurb}</p>
        </div>
      </div>

      <ol className="flex flex-col gap-2" aria-label="The three stages">
        {preset.stages.map(({ key: stage, goal }, i) => (
          <li
            key={stage}
            className="flex items-center gap-3 rounded-2xl border border-ds-line bg-ds-card p-3"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ds-sunk ds-type-caption font-semibold text-ds-ink">
              {i + 1}
            </span>
            <span>
              <span className="block ds-type-footnote font-semibold text-ds-ink">
                {STAGE_LABELS[stage]}
              </span>
              <span className="block ds-type-caption text-ds-ink-soft">{goal}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-2">
        <p id="preset-date-label" className="ds-type-footnote font-semibold text-ds-ink">
          Add a date <span className="font-normal text-ds-ink-soft">(optional)</span>
        </p>
        <button
          ref={dateToggle}
          type="button"
          aria-labelledby="preset-date-label preset-date-value"
          aria-expanded={picking}
          onClick={() => setPicking((v) => !v)}
          className="flex items-center justify-between rounded-xl border border-ds-line bg-ds-card px-3 py-3 text-left ds-type-footnote text-ds-ink"
        >
          <span id="preset-date-value" className={date ? "text-ds-ink" : "text-ds-ink-soft"}>
            {date ? shortDay(date) : "Pick a date"}
          </span>
        </button>
        {picking && (
          <MonthPicker
            value={date}
            min={today}
            onChange={(d) => {
              setDate(d);
              setPicking(false);
              // The calendar is gone: focus goes back to the button that opened it.
              queueMicrotask(() => dateToggle.current?.focus());
            }}
          />
        )}
        {date && (
          <button
            type="button"
            onClick={() => setDate(null)}
            className="self-start ds-type-caption font-semibold text-ds-ink-soft"
          >
            Remove the date
          </button>
        )}
        <p className="ds-type-caption text-ds-ink-soft">
          With a date, Alphonso spaces the stages before it. Without one, you go at your own pace.
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

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void go(false)}
          className="rounded-full bg-ds-brand px-5 py-3 font-semibold text-ds-card disabled:opacity-40"
        >
          {busy ? "Preparing…" : "Start now"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void go(true)}
          className="rounded-full border border-ds-line px-5 py-3 font-semibold text-ds-ink disabled:opacity-40"
        >
          Personalise
        </button>
      </div>
      <p className="ds-type-caption text-ds-ink-soft">
        Alphonso is an AI. This is only for practising what you say.
      </p>
    </section>
  );
}
