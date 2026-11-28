import { useEffect, useRef } from "react";
import type { PresetId, PresetSummary } from "@/lib/rehearsal-presets";

/** One small outline icon per preset (the approved mock's set). Decorative: the label is the name. */
const ICONS: Record<PresetId, string> = {
  job_interview: "M3 7h18v13H3zM9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18",
  talk_to_manager:
    "M9 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3.5 19a5.5 5.5 0 0 1 11 0M16 6.5a3 3 0 0 1 0 5.5M18.5 19a5 5 0 0 0-3-4.6",
  doctor_appointment: "M4 4h16v16H4zM12 8v8M8 12h8",
  apartment_landlord: "M4 11l8-7 8 7v9H4zM10 20v-6h4v6",
  bank_account: "M3 9l9-5 9 5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18",
  parent_teacher: "M2 9l10-5 10 5-10 5zM6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5",
  first_day:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4",
  customer_service_call: "M4 14v-2a8 8 0 0 1 16 0v2M3 14h4v6H3zM17 14h4v6h-4zM19 20c0 1.5-2 2-5 2",
};

export function PresetIcon({ id, size = 20 }: { id: PresetId; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[id]} />
    </svg>
  );
}

/**
 * The first thing a learner meets on Rehearse: the ready-made situations for this course, one tap each, and
 * "Something else" for the four-question intake. Alphonso is always labelled as an AI.
 */
export function QuickStartPicker({
  presets,
  freeAvailable,
  onPick,
  onSomethingElse,
}: {
  presets: PresetSummary[];
  /** True while the account's free rehearsal is unused: the line says so. */
  freeAvailable: boolean;
  onPick: (preset: PresetSummary) => void;
  onSomethingElse: () => void;
}) {
  // Coming back from a preview moves focus to this heading.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <section className="flex flex-col gap-4 px-5 py-6" aria-label="Choose a rehearsal">
      <div>
        <h1
          ref={heading}
          tabIndex={-1}
          className="font-display ds-type-title font-semibold text-ds-ink outline-none"
        >
          Rehearse a real conversation
        </h1>
        <p className="mt-1 ds-type-footnote text-ds-ink-soft">
          Pick what is coming up. Alphonso (AI) plays the other person.
          {freeAvailable ? " Your first rehearsal is free." : ""}
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-2.5">
        {presets.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onPick(p)}
              className="flex h-full min-h-20 w-full flex-col items-start gap-2 rounded-2xl border border-ds-line bg-ds-card p-3 text-left"
            >
              <span className="grid size-9 place-items-center rounded-xl bg-ds-brand/10 text-ds-brand">
                <PresetIcon id={p.id} />
              </span>
              <span className="ds-type-footnote font-semibold text-ds-ink">{p.title}</span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onSomethingElse}
        className="flex items-center gap-3 rounded-2xl border border-dashed border-ds-line bg-ds-card p-3 text-left"
      >
        <span className="grid size-9 place-items-center rounded-xl bg-ds-sunk text-ds-ink-soft">
          <svg
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
        <span className="flex-1">
          <span className="block ds-type-footnote font-semibold text-ds-ink">Something else</span>
          <span className="block ds-type-caption text-ds-ink-soft">
            Describe it yourself, 4 short questions
          </span>
        </span>
      </button>
      <p className="ds-type-caption text-ds-ink-soft">
        Ready-made rehearsals start in one tap. No typing, and no date needed.
      </p>
    </section>
  );
}
