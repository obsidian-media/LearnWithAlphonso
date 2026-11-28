import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import type { Course } from "@/data/course-meta";
import {
  fetchPresets,
  fetchRehearsals,
  type RehearsalError,
  type RehearsalState,
  type RehearsalSummary,
} from "@/lib/rehearsal-api";
import { REHEARSAL_ERROR_TEXT } from "@/lib/rehearsal-copy";
import { localToday, shortDay } from "@/lib/rehearsal-dates";
import type { PresetSummary } from "@/lib/rehearsal-presets";
import { EVENT_KIND_LABELS } from "@/lib/rehearsal-rules";
import { useProStatus } from "@/lib/use-pro-status";
import { ActiveRehearsal } from "./ActiveRehearsal";
import { HowDidItGo } from "./HowDidItGo";
import { RehearsalIntakeForm } from "./RehearsalIntakeForm";
import { RehearsalPaywallSheet } from "./RehearsalPaywallSheet";
import { Phrasebook } from "./Phrasebook";
import { PresetPreview } from "./PresetPreview";
import { QuickStartPicker } from "./QuickStartPicker";

/**
 * Rehearsals, in the order the learner meets them: "How did it go?" once the event day has passed; otherwise the plan
 * of the active rehearsal (Adjust re-opens the four questions); with none, the quick-start picker (eight ready-made
 * situations; "Something else" leads to the intake, and with no presets offered the intake comes first), or, for a learner who is not Pro
 * and has used the free rehearsal, their finished rehearsals (still readable) and the Pro sheet. The page is behind
 * the server flag REHEARSALS_ENABLED: while it is off, the API answers "not_enabled" and the learner sees a plain
 * "not available" instead of a form that could never be submitted.
 */
export function RehearsePage({ course, today = localToday() }: { course: Course; today?: string }) {
  const [state, setState] = useState<RehearsalState | null>(null);
  const [error, setError] = useState<RehearsalError | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [sheet, setSheet] = useState(true);
  const [phrases, setPhrases] = useState(false);
  // The quick-starts (empty when the server has none, which shows the four questions straight away), the one being
  // previewed, and whether the learner chose "Something else".
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [picked, setPicked] = useState<PresetSummary | null>(null);
  const [elseChosen, setElseChosen] = useState(false);
  const pro = useProStatus();

  const load = useCallback(async () => {
    setError(null);
    setAdjusting(false);
    setPhrases(false);
    const [result, quick] = await Promise.all([fetchRehearsals(course), fetchPresets(course)]);
    setPresets(quick.ok ? quick.value : []);
    setPicked(null);
    setElseChosen(false);
    if (result.ok) setState(result.value);
    else setError(result.error);
  }, [course]);

  useEffect(() => {
    setState(null);
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="flex flex-col gap-4 px-5 py-8">
        <p role="alert" className="ds-type-footnote text-ds-ink">
          {REHEARSAL_ERROR_TEXT[error]}
        </p>
        {error === "not_enabled" ? (
          <Link to="/learn" className="ds-type-footnote font-semibold text-ds-brand">
            Back to Learn
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => void load()}
            className="self-start rounded-full border border-ds-line px-4 py-2 ds-type-footnote font-semibold text-ds-ink"
          >
            Try again
          </button>
        )}
      </div>
    );
  }
  if (!state) {
    return (
      <p role="status" className="px-5 py-8 ds-type-footnote text-ds-ink-soft">
        Loading…
      </p>
    );
  }

  const active = state.active;
  if (active) {
    if (adjusting)
      return (
        <RehearsalIntakeForm
          course={course}
          existing={active}
          today={today}
          onCreated={() => void load()}
          onCancel={() => setAdjusting(false)}
        />
      );
    if (active.eventDate && today > active.eventDate)
      return (
        <HowDidItGo
          rehearsal={active}
          nextStage={state.nextStage}
          today={today}
          onDone={() => void load()}
        />
      );
    if (phrases && state.progress?.warmup === "done")
      return <Phrasebook rehearsal={active} onBack={() => setPhrases(false)} />;
    return (
      <ActiveRehearsal
        rehearsal={active}
        progress={state.progress}
        nextStage={state.nextStage}
        today={today}
        onAdjust={() => setAdjusting(true)}
        onOpenPhrases={() => setPhrases(true)}
        onDeleted={() => void load()}
      />
    );
  }

  // No rehearsal. The free one is still there, or the learner is Pro: the intake.
  const needsPro = !state.freeAvailable;
  if (!needsPro || pro.state === "pro") {
    if (presets.length === 0 || elseChosen)
      return <RehearsalIntakeForm course={course} today={today} onCreated={() => void load()} />;
    if (picked)
      return (
        <PresetPreview
          course={course}
          preset={picked}
          today={today}
          onBack={() => setPicked(null)}
          onCreated={async (_created, personalise) => {
            await load();
            // Personalise is the same four questions as Adjust, opened on the rehearsal just made.
            if (personalise) setAdjusting(true);
          }}
        />
      );
    return (
      <QuickStartPicker
        presets={presets}
        freeAvailable={state.freeAvailable}
        onPick={setPicked}
        onSomethingElse={() => setElseChosen(true)}
      />
    );
  }
  if (pro.state === "loading")
    return (
      <p role="status" className="px-5 py-8 ds-type-footnote text-ds-ink-soft">
        Loading…
      </p>
    );
  if (pro.state === "error")
    return (
      <p role="alert" className="px-5 py-8 ds-type-footnote text-ds-ink">
        {REHEARSAL_ERROR_TEXT.retry}
      </p>
    );
  const last = state.history[0] ?? null;
  return (
    <>
      <FinishedRehearsals history={state.history} />
      {sheet && <RehearsalPaywallSheet done={last} onClose={() => setSheet(false)} />}
    </>
  );
}

/** The learner's finished rehearsals, read-only: the plan and run history stay readable after the free one. */
function FinishedRehearsals({ history }: { history: RehearsalSummary[] }) {
  return (
    <section className="flex flex-col gap-4 px-5 py-6" aria-label="Your rehearsals">
      <h1 className="font-display ds-type-title font-semibold text-ds-ink">Your rehearsals</h1>
      {history.length === 0 ? (
        <p className="ds-type-footnote text-ds-ink-soft">Nothing here yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {history.map((h) => (
            <li key={h.id} className="rounded-2xl border border-ds-line bg-ds-card p-4">
              <p className="ds-type-headline font-semibold text-ds-ink">
                {EVENT_KIND_LABELS[h.eventKind]}
              </p>
              <p className="ds-type-caption text-ds-ink-soft">
                {h.eventDate ? `${shortDay(h.eventDate)} · ` : ""}
                {h.stagesDone} of 3 stages · {h.runs} {h.runs === 1 ? "run" : "runs"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
