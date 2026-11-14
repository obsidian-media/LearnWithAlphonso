import type { Achievement } from "../data/achievements";
import {
  badgeRing,
  badgeSrc,
  progressLine,
  type BadgeEntry,
  type BadgeState,
} from "../lib/badge-state";
import { DsIcon } from "./ds/DsIcon";

/**
 * One achievement as a collectible medallion (round 12, 14b). Earned is the art in full colour; in progress is dimmed
 * with a gold ring that fills clockwise; locked is a grey silhouette with a lock. The same art serves all three, so
 * no extra assets. Decorative: the text next to it carries the meaning.
 */
export function Medallion({
  achievement,
  state,
  ring = 0,
  size = 76,
}: {
  achievement: Achievement;
  state: BadgeState;
  /** 0 to 1, the progress ring. */
  ring?: number;
  size?: number;
}) {
  const R = 46;
  const C = 2 * Math.PI * R;
  return (
    <span
      aria-hidden="true"
      data-badge-state={state}
      className="relative inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <img
        src={badgeSrc(achievement.id)}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        draggable={false}
        className={`size-full object-contain ${
          state === "earned"
            ? "drop-shadow-[0_3px_4px_color-mix(in_srgb,var(--c-ink)_30%,transparent)]"
            : state === "progress"
              ? "opacity-60 saturate-50"
              : "opacity-50 brightness-75 grayscale"
        }`}
      />
      {state === "progress" && (
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90" fill="none">
          <circle cx="50" cy="50" r={R} strokeWidth="5" className="stroke-ds-line" />
          <circle
            cx="50"
            cy="50"
            r={R}
            strokeWidth="5"
            strokeLinecap="round"
            className="stroke-ds-xp"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - ring)}
          />
        </svg>
      )}
      {state === "locked" && (
        <span className="absolute bottom-0 right-0 grid size-[30%] place-items-center rounded-full bg-ds-card text-ds-ink-soft shadow-[var(--ds-shadow-resting)]">
          <DsIcon name="lock" className="size-[60%]" />
        </span>
      )}
    </span>
  );
}

/** The catalog grid's card: the medallion, the name, and the description (or "12 of 30" while in progress). */
export function AchievementBadge({
  achievement,
  entry,
  onOpen,
}: {
  achievement: Achievement;
  /** From badgeStates: earned, in progress (with what the learner has) or locked. */
  entry: BadgeEntry;
  /** Opens the badge's detail. */
  onOpen?: () => void;
}) {
  const { state, value } = entry;
  const ring = badgeRing({ value, threshold: achievement.threshold });
  const body = (
    <>
      <Medallion achievement={achievement} state={state} ring={ring} />
      <p
        className={`ds-type-caption leading-tight ${state === "locked" ? "text-ds-ink-soft" : "text-ds-ink"}`}
      >
        {achievement.title}
      </p>
      <p
        className={`ds-type-caption leading-tight ${state === "progress" ? "font-extrabold text-ds-xp-text" : "font-semibold text-ds-ink-soft"}`}
      >
        {state === "progress" && value !== null
          ? progressLine(value, achievement.threshold)
          : achievement.description}
      </p>
    </>
  );
  const cls = `grid h-full w-full justify-items-center content-start gap-1.5 rounded-[22px] border-2 border-ds-line px-1.5 py-3 text-center ${
    state === "locked" ? "bg-ds-sunk" : "bg-ds-card"
  }`;
  return onOpen ? (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${achievement.title}: ${achievement.description}`}
      className={`${cls} focus-visible:outline-2 focus-visible:outline-ds-choice`}
    >
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
