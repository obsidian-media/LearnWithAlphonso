import { useState } from "react";
import { AiLabel } from "@/components/AiLabel";
import { cancelRehearsal, rehearsalOutcome, type Rehearsal, type RehearsalError } from "@/lib/rehearsal-api";
import { REHEARSAL_ERROR_TEXT } from "@/lib/rehearsal-copy";
import { addDaysTo, localToday, longDay, shortDay } from "@/lib/rehearsal-dates";
import { EVENT_KIND_LABELS, type OutcomeChoice } from "@/lib/rehearsal-rules";
import { MonthPicker } from "./MonthPicker";

const TAPS: { choice: Exclude<OutcomeChoice, "moved">; label: string; sub?: string }[] = [
  { choice: "well", label: "Went well" },
  { choice: "ok", label: "OK" },
  { choice: "hard", label: "It was hard", sub: "Alphonso can help you practise those parts" },
];

/**
 * "How did it go?" after the event: four taps and nothing typed, so no learner text is stored. "It didn't happen /
 * moved" opens a date picker (the new day must be after today) and keeps the rehearsal going; the other way out is
 * closing the rehearsal, which is a cancel (no outcome the learner did not give).
 */
export function HowDidItGo({
  rehearsal,
  onDone,
  today = localToday(),
}: {
  rehearsal: Rehearsal;
  onDone: () => void;
  today?: string;
}) {
  const [moving, setMoving] = useState(false);
  const [date, setDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<RehearsalError | null>(null);
  const kind = EVENT_KIND_LABELS[rehearsal.eventKind];

  async function run(go: () => Promise<{ ok: boolean; error?: RehearsalError }>) {
    setBusy(true);
    setError(null);
    const r = await go();
    setBusy(false);
    if (r.ok) onDone();
    else setError(r.error ?? "failed");
  }

  const tap = "flex w-full items-center gap-3 rounded-2xl border border-ds-line bg-ds-card p-4 text-left disabled:opacity-50";

  return (
    <section className="flex flex-col gap-5 px-5 py-6" aria-label="How did it go?">
      <div>
        <h1 className="font-display ds-type-title font-semibold text-ds-ink">How did it go?</h1>
        <p className="mt-1 ds-type-footnote text-ds-ink-soft">
          {longDay(today)} · {kind}
        </p>
      </div>

      {moving ? (
        <div className="flex flex-col gap-3">
          <h2 className="ds-type-headline font-semibold text-ds-ink">When is it now?</h2>
          <p className="ds-type-footnote text-ds-ink-soft">
            Your rehearsal continues. Stage 2 comes back before the new date.
          </p>
          <MonthPicker
            value={date}
            min={addDaysTo(today, 1)}
            onChange={setDate}
          />
          <button
            type="button"
            disabled={date === null || busy}
            onClick={() => date && void run(() => rehearsalOutcome(rehearsal.id, "moved", date))}
            className="rounded-full bg-ds-brand px-5 py-3 font-semibold text-ds-card disabled:opacity-40"
          >
            {date ? `Move my rehearsal to ${shortDay(date)}` : "Pick the new day"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => cancelRehearsal(rehearsal.id))}
            className="ds-type-footnote font-semibold text-ds-ink-soft underline"
          >
            It didn&apos;t happen, close the rehearsal
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="ds-type-headline font-semibold text-ds-ink">How did your {kind.toLowerCase()} go?</p>
          <p className="flex items-center gap-2 ds-type-footnote text-ds-ink-soft">
            <AiLabel /> One tap is enough. Alphonso (AI) will remember it.
          </p>
          {TAPS.map((t) => (
            <button
              key={t.choice}
              type="button"
              disabled={busy}
              onClick={() => void run(() => rehearsalOutcome(rehearsal.id, t.choice))}
              className={tap}
            >
              <span className="min-w-0 flex-1">
                <span className="block ds-type-headline font-semibold text-ds-ink">{t.label}</span>
                {t.sub && <span className="block ds-type-caption text-ds-ink-soft">{t.sub}</span>}
              </span>
            </button>
          ))}
          <button type="button" disabled={busy} onClick={() => setMoving(true)} className={tap}>
            <span className="min-w-0 flex-1">
              <span className="block ds-type-headline font-semibold text-ds-ink">
                It didn&apos;t happen / moved
              </span>
              <span className="block ds-type-caption text-ds-ink-soft">You can set a new date</span>
            </span>
          </button>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-ds-wrong bg-ds-wrong-tint px-3 py-2 ds-type-footnote text-ds-wrong-ink"
        >
          {REHEARSAL_ERROR_TEXT[error]}
        </p>
      )}
      <p className="ds-type-caption text-ds-ink-soft">
        Just a tap. No words are stored. You can delete this rehearsal any time.
      </p>
    </section>
  );
}
