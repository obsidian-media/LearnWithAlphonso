import { AiLabel } from "@/components/AiLabel";
import { type Rehearsal } from "@/lib/rehearsal-api";
import type { RehearsalBrief } from "@/lib/rehearsal-brief";
import { EVENT_KIND_LABELS } from "@/lib/rehearsal-rules";
import { useModelSpeech } from "@/lib/use-model-speech";

export type PhraseRow = { phrase: string; meaning: string | null };

/**
 * The brief's key phrases, each with its meaning line when there is one. Meanings exist only on a hand-written
 * quick-start brief and are index-aligned with the phrases; a list that does not line up is ignored whole, so a
 * phrase is never shown beside another phrase's meaning.
 */
export function phraseRows(brief: RehearsalBrief): PhraseRow[] {
  const meanings = brief.keyPhraseMeanings;
  const aligned =
    Array.isArray(meanings) &&
    meanings.length === brief.keyPhrases.length &&
    meanings.every((m) => typeof m === "string" && m.trim() !== "");
  return brief.keyPhrases.map((phrase, i) => ({
    phrase,
    meaning: aligned ? meanings![i]! : null,
  }));
}

/**
 * "Your phrases for this {event}": the key phrases of the warm-up, to hear again on the day. Tapping one speaks it with
 * /api/tts (kept for quick-start phrases) and falls back to the device voice. Alphonso is labelled an AI.
 */
export function Phrasebook({ rehearsal, onBack }: { rehearsal: Rehearsal; onBack: () => void }) {
  const speak = useModelSpeech(rehearsal.course);
  const rows = phraseRows(rehearsal.brief);
  const event = EVENT_KIND_LABELS[rehearsal.eventKind].toLowerCase();
  return (
    <section className="flex flex-col gap-4 px-5 py-6" aria-label="Your phrases">
      <button
        type="button"
        onClick={onBack}
        className="min-h-11 self-start rounded-full px-2 ds-type-footnote font-semibold text-ds-ink-soft"
      >
        Back to the plan
      </button>
      <div>
        <h1 className="font-display ds-type-title font-semibold text-ds-ink">
          Your phrases for this {event}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 ds-type-footnote text-ds-ink-soft">
          <span>Tap play to hear Alphonso say it.</span>
          <AiLabel />
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li
            key={row.phrase}
            className="flex items-center gap-3 rounded-2xl border border-ds-line bg-ds-card p-3"
          >
            <button
              type="button"
              aria-label={`Hear: ${row.phrase}`}
              onClick={() => void speak(row.phrase)}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-ds-brand text-ds-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <p className="ds-type-headline font-semibold text-ds-ink">{row.phrase}</p>
              {row.meaning && <p className="ds-type-caption text-ds-ink-soft">{row.meaning}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
