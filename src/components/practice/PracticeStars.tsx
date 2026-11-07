import { DsIcon } from "../ds/DsIcon";
import { MAX_STARS } from "@/lib/practice-stars";

/**
 * Practice's stars, drawn after the approved mock-up (09-practice-hub-mockup v3): gold for each star earned, and an
 * empty star for each one still to win, pale on a picture or a navy card ("onDark") and cream on a light card.
 * One accessible name for the group ("2 of 3 stars"); the stars themselves are decorative.
 */
export function PracticeStars({
  n,
  size = "sm",
  onDark = false,
  className = "",
}: {
  n: number;
  size?: "xs" | "sm" | "md";
  onDark?: boolean;
  className?: string;
}) {
  const box = size === "xs" ? "size-2.5" : size === "md" ? "size-4" : "size-3.5";
  const off = onDark ? "text-ds-on-hero/35" : "text-ds-line";
  return (
    <span
      role="img"
      aria-label={`${n} of ${MAX_STARS} stars`}
      data-stars={n}
      className={`inline-flex items-center gap-px ${className}`}
    >
      {Array.from({ length: MAX_STARS }, (_, k) => (
        <DsIcon
          key={k}
          name="star"
          solid
          className={`${box} ${k < n ? "text-ds-action drop-shadow-[0_1px_0_var(--c-action-edge)]" : off}`}
        />
      ))}
    </span>
  );
}

/** The star counter: stars held out of the most the course can hold, both from data. */
export function StarTally({
  earned,
  total,
  className = "",
}: {
  earned: number;
  total: number;
  className?: string;
}) {
  return (
    <span
      data-star-tally=""
      aria-label={`${earned} of ${total} stars earned`}
      className={`inline-flex items-center gap-1.5 rounded-full border-2 border-ds-line bg-ds-card py-0.5 pl-1.5 pr-2.5 ds-type-caption font-extrabold text-ds-ink ${className}`}
    >
      <DsIcon name="star" solid className="size-4 text-ds-action" />
      <span className="tabular-nums" aria-hidden="true">
        {earned}
      </span>
      <span className="text-ds-ink-soft" aria-hidden="true">
        / {total}
      </span>
    </span>
  );
}
