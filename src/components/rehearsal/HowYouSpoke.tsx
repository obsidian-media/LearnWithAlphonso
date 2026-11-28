import {
  SPEAKING_TITLES,
  speakingSentence,
  trendOf,
  type RehearsalSpeaking,
  type Trend,
} from "@/lib/rehearsal-speaking";

const ARROW: Record<NonNullable<Trend> | "first", string> = {
  up: "M12 19V6M6 11l6-6 6 6",
  down: "M12 5v13M6 13l6 6 6-6",
  same: "M5 12h14M13 6l6 6-6 6",
  first: "M5 12.5l4.5 4.5L19 7.5",
};

/**
 * "How you spoke" on the rehearsal debrief: up to three plain notes with counts and a small trend arrow. Neutral colours
 * only (a lower number is never red, and there is no score, percentage or grade). The arrow is decoration: the sentence
 * beside it says the same thing in words ("up from 4 last time"), so it is hidden from assistive technology.
 */
export function HowYouSpoke({ speaking }: { speaking: RehearsalSpeaking | null | undefined }) {
  if (!speaking || speaking.notes.length === 0) return null;
  return (
    <section
      aria-labelledby="how-you-spoke"
      className="rounded-2xl border border-ds-line px-4 py-3"
    >
      <h2
        id="how-you-spoke"
        className="ds-type-caption font-semibold uppercase tracking-wide text-ds-ink-soft"
      >
        How you spoke
      </h2>
      <ul className="mt-1 divide-y divide-ds-line">
        {speaking.notes.map((n) => (
          <li key={n.kind} className="flex items-start gap-3 py-2.5">
            <span
              aria-hidden="true"
              data-trend={trendOf(n) ?? "first"}
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ds-sunk text-ds-ink-soft"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={ARROW[trendOf(n) ?? "first"]} />
              </svg>
            </span>
            <div>
              <p className="ds-type-footnote font-semibold text-ds-ink">
                {SPEAKING_TITLES[n.kind]}
              </p>
              <p className="ds-type-caption text-ds-ink-soft">{speakingSentence(n)}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
