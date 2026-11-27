import { useState } from "react";
import { addMonths, monthGrid, monthTitle, longDay } from "@/lib/rehearsal-dates";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/**
 * A month calendar, Monday first, open by default: the intake's "When is it?" and the moved date. `min` is the first
 * day that can be picked (the learner's today, or tomorrow for a moved date); earlier days are disabled.
 */
export function MonthPicker({
  value,
  min,
  onChange,
}: {
  value: string | null;
  min: string;
  onChange: (day: string) => void;
}) {
  const start = value ?? min;
  const [view, setView] = useState({
    year: Number(start.slice(0, 4)),
    month: Number(start.slice(5, 7)) - 1,
  });
  const weeks = monthGrid(view.year, view.month);
  const go = (by: number) => setView((v) => addMonths(v.year, v.month, by));
  const arrow =
    "grid size-9 place-items-center rounded-full border border-ds-line bg-ds-card text-ds-ink-soft";

  return (
    <div className="rounded-2xl border border-ds-line bg-ds-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label="Previous month" onClick={() => go(-1)} className={arrow}>
          ‹
        </button>
        <p aria-live="polite" className="ds-type-footnote font-semibold text-ds-ink">
          {monthTitle(view.year, view.month)}
        </p>
        <button type="button" aria-label="Next month" onClick={() => go(1)} className={arrow}>
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((d) => (
          <span key={d} aria-hidden="true" className="ds-type-caption text-ds-ink-soft">
            {d}
          </span>
        ))}
        {weeks.flat().map((day, i) =>
          day === null ? (
            <span key={`pad-${i}`} />
          ) : (
            <button
              key={day}
              type="button"
              disabled={day < min}
              aria-label={longDay(day)}
              aria-pressed={day === value}
              onClick={() => onChange(day)}
              className={`grid h-9 place-items-center rounded-full ds-type-footnote disabled:opacity-30 ${
                day === value
                  ? "bg-ds-brand font-semibold text-ds-card"
                  : "text-ds-ink hover:bg-ds-sunk"
              }`}
            >
              {Number(day.slice(8))}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
