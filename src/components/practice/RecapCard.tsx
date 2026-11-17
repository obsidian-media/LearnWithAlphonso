import { Link } from "@tanstack/react-router";
import { DsIcon } from "../ds/DsIcon";
import type { RecapController } from "@/lib/use-call-recap";

/**
 * "From this call" (approved mock: r15-recap): up to three corrections, one new phrase, Review these. It takes the
 * slot "Your slip" has, and PracticeResult shows the slip whenever this has nothing to show. Text only; a speaker
 * button plays just that phrase.
 */
function Speak({
  text,
  ctl,
  tone,
}: {
  text: string;
  ctl: RecapController;
  tone: "choice" | "plain";
}) {
  const on = ctl.speaking === text;
  return (
    <button
      type="button"
      aria-label={`Hear: ${text}`}
      aria-pressed={on}
      onClick={() => ctl.onSpeak(text)}
      className={`grid size-11 shrink-0 place-items-center rounded-[14px] shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--c-choice)_22%,transparent)] ${
        on
          ? "bg-ds-choice text-ds-on-choice shadow-[0_3px_0_var(--c-choice-edge)]"
          : tone === "plain"
            ? "bg-ds-card text-ds-choice"
            : "bg-ds-choice-tint text-ds-choice"
      }`}
    >
      <DsIcon name="speaker" className="size-[22px]" />
    </button>
  );
}

/** Same footprint as the card, so nothing jumps when it arrives. */
export function RecapSkeleton() {
  return (
    <section
      aria-busy="true"
      aria-label="From this call"
      data-recap="pending"
      className="overflow-hidden rounded-[18px] border-2 border-ds-line bg-ds-card text-left"
    >
      <div className="flex items-center justify-between gap-2 px-3.5 pb-2 pt-2.5">
        <span className="ds-type-overline text-ds-action-text">From this call</span>
        <span className="ds-type-caption text-ds-ink-soft">Alphonso is writing it up</span>
      </div>
      {[72, 64, 58].map((w) => (
        <div key={w} className="grid gap-[7px] border-t-2 border-ds-line px-3.5 py-3">
          <i className="block h-[11px] rounded-md bg-ds-sunk" style={{ width: `${w}%` }} />
          <i className="block h-[11px] rounded-md bg-ds-sunk" style={{ width: `${w + 20}%` }} />
        </div>
      ))}
    </section>
  );
}

export function RecapCard({ ctl, lang }: { ctl: RecapController; lang: string }) {
  const r = ctl.recap;
  if (!r) return null;
  return (
    <>
      <section
        aria-label="From this call"
        data-recap="ready"
        className="overflow-hidden rounded-[18px] border-2 border-ds-line bg-ds-card text-left"
      >
        <div className="flex items-center justify-between gap-2 px-3.5 pb-2 pt-2.5">
          <span className="ds-type-overline text-ds-action-text">From this call</span>
          <span className="inline-flex items-center gap-[3px] ds-type-caption text-ds-ink-soft">
            Tap <DsIcon name="speaker" className="size-3.5" /> to hear it
          </span>
        </div>
        {r.corrections.map((c) => (
          <div
            key={c.topic}
            data-correction={c.topic}
            className="flex items-center gap-2.5 border-t-2 border-ds-line px-3.5 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <p lang={lang} className="ds-type-footnote font-semibold text-ds-wrong-ink">
                <s className="decoration-ds-wrong decoration-2">{c.said}</s>
              </p>
              <p lang={lang} className="mt-px ds-type-subhead font-extrabold text-ds-right-ink">
                {c.fixed}
              </p>
              <p className="mt-0.5 ds-type-caption font-bold text-ds-ink-soft">{c.why}</p>
            </div>
            <Speak text={c.fixed} ctl={ctl} tone="choice" />
          </div>
        ))}
        {r.phrase && (
          <div
            data-new-phrase=""
            className="flex items-center gap-2.5 border-t-2 border-ds-line bg-ds-action-tint px-3.5 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <span className="ds-type-overline text-ds-action-text">New phrase</span>
              <p lang={lang} className="mt-0.5 ds-type-headline font-extrabold text-ds-ink">
                {r.phrase.text}
              </p>
              <p className="mt-0.5 ds-type-caption font-bold text-ds-ink-soft">
                {r.phrase.meaning}
              </p>
            </div>
            <Speak text={r.phrase.text} ctl={ctl} tone="plain" />
          </div>
        )}
        {r.reviewToken && (
          <div className="flex justify-center border-t-2 border-ds-line px-2 py-1">
            {ctl.review === "added" ? (
              <span
                role="status"
                className="inline-flex min-h-11 items-center gap-2 px-3.5 ds-type-subhead font-extrabold text-ds-right-ink"
              >
                <DsIcon name="check" className="size-5" />
                Added to your review
              </span>
            ) : (
              <button
                type="button"
                disabled={ctl.review === "adding"}
                onClick={ctl.onReview}
                className="inline-flex min-h-11 items-center gap-2 px-3.5 ds-type-subhead font-extrabold text-ds-choice disabled:opacity-60"
              >
                <span aria-hidden="true" className="ds-type-title leading-none">
                  +
                </span>
                Review these
                <span className="inline-grid h-[22px] min-w-[22px] place-items-center rounded-full bg-ds-choice-tint ds-type-caption font-extrabold text-ds-choice">
                  {r.reviewCount}
                </span>
              </button>
            )}
          </div>
        )}
        {ctl.review === "failed" && (
          <p role="alert" className="px-3.5 pb-2 text-center ds-type-caption text-ds-wrong-ink">
            Could not add these. Try again.
          </p>
        )}
      </section>
      {r.saved && (
        <p className="-mt-1 flex items-center justify-center gap-[5px] ds-type-caption font-bold text-ds-ink-soft">
          <DsIcon name="lock" className="size-[13px]" />
          Saved in{" "}
          <Link to="/profile/memory" className="text-ds-choice underline underline-offset-2">
            What Alphonso remembers
          </Link>
        </p>
      )}
    </>
  );
}
