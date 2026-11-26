import { Link } from "@tanstack/react-router";
import type { OfferStyle } from "../lib/placement-offer";

export const PLACEMENT_OFFER_COPY = {
  title: "Find your level",
  body: "A 5-minute placement test sets your level so lessons start in the right place.",
  start: "Start",
  notNow: "Not now",
  quietTitle: "Not sure where to start?",
  quietBody: "Take a quick placement test and we'll set your CEFR level for you.",
  quietLink: "Take the placement test",
} as const;

/**
 * The placement offer, in the existing card styling (no new screen). "prominent" is the invitation with Start and
 * Not now; "quiet" is the small card that stays on Learn for beginners and after a "Not now".
 */
export function PlacementOfferCard({
  style,
  onNotNow,
  className = "",
}: {
  style: Exclude<OfferStyle, "none">;
  onNotNow: () => void;
  className?: string;
}) {
  if (style === "quiet") {
    return (
      <div
        data-placement-offer="quiet"
        className={`rounded-2xl border border-ds-action/30 bg-ds-action/10 p-4 ${className}`}
      >
        <p className="font-display text-base font-semibold text-ds-ink">
          {PLACEMENT_OFFER_COPY.quietTitle}
        </p>
        <p className="mt-1 text-xs text-ds-ink-soft/80">{PLACEMENT_OFFER_COPY.quietBody}</p>
        <Link
          to="/placement"
          className="mt-3 inline-flex min-h-11 items-center rounded-full bg-ds-brand px-4 text-xs font-semibold text-ds-card"
        >
          {PLACEMENT_OFFER_COPY.quietLink}
        </Link>
      </div>
    );
  }
  return (
    <div
      data-placement-offer="prominent"
      className={`rounded-3xl border-2 border-ds-brand bg-ds-sunk p-5 ${className}`}
    >
      <p className="font-display text-xl font-bold text-ds-ink">{PLACEMENT_OFFER_COPY.title}</p>
      <p className="mt-1 text-sm text-ds-ink-soft">{PLACEMENT_OFFER_COPY.body}</p>
      <div className="mt-3 flex items-center gap-3">
        <Link
          to="/placement"
          className="inline-flex min-h-11 items-center rounded-full bg-ds-brand px-5 text-sm font-semibold text-ds-card"
        >
          {PLACEMENT_OFFER_COPY.start}
        </Link>
        <button
          type="button"
          onClick={onNotNow}
          className="min-h-11 rounded-full px-4 text-sm font-semibold text-ds-ink-soft"
        >
          {PLACEMENT_OFFER_COPY.notNow}
        </button>
      </div>
    </div>
  );
}
