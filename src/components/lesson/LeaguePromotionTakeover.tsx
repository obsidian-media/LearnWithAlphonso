import { useId } from "react";
import { LEAGUE_TIER_META, LEAGUE_TIERS, type LeagueTier } from "../../data/achievements";
import { promotionCopy } from "../../lib/league-engagement";
import { usePrefersReducedMotion } from "../../lib/use-prefers-reduced-motion";
import { dsButtonClass } from "../ds/buttons";
import { Modal } from "../Modal";
import { Confetti } from "./LessonCelebration";

/**
 * A league's shield, in the league's own colour. Drawn inline so the colour can be the tier's (from the data) and the
 * rim and the star come from the design system's gold tokens.
 */
function Shield({
  tier,
  width,
  height,
  star = true,
  earned = true,
}: {
  tier: LeagueTier;
  width: number;
  height: number;
  star?: boolean;
  /** Tiers above the learner's are drawn with a quiet rim, not the gold one. */
  earned?: boolean;
}) {
  const gradientId = useId();
  const fill = LEAGUE_TIER_META[tier].hex;
  return (
    <svg viewBox="0 0 190 210" width={width} height={height} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: fill, stopOpacity: 0.75 }} />
          <stop offset="1" style={{ stopColor: fill }} />
        </linearGradient>
      </defs>
      <path
        d="M95 10 172 40v56c0 50-32 85-77 104C50 181 18 146 18 96V40Z"
        fill={`url(#${gradientId})`}
        strokeWidth="10"
        strokeLinejoin="round"
        style={{ stroke: earned ? "var(--c-xp)" : "var(--c-on-hero-soft)" }}
      />
      <path
        d="M95 30 154 53v43c0 39-24 67-59 83-35-16-59-44-59-83V53Z"
        fill="none"
        strokeWidth="3"
        strokeLinejoin="round"
        style={{ stroke: "color-mix(in srgb, var(--c-on-hero) 35%, transparent)" }}
      />
      {star && (
        <path
          d="M95 66l11.5 24 26.5 3.5-19.4 18 4.9 26.1L95 125l-23.5 12.6 4.9-26.1-19.4-18 26.5-3.5Z"
          strokeWidth="3"
          strokeLinejoin="round"
          style={{ fill: "var(--c-on-hero-kick)", stroke: "var(--c-xp-edge)" }}
        />
      )}
    </svg>
  );
}

/**
 * The league promotion takeover (CD 01, "League promotion"): full screen after a lesson's celebration, the hero
 * gradient with gold rays, the new league's shield in its own colour, "Welcome to Grove", the five-league ladder with
 * the new one lit, and Alphonso amazed. Continue goes back to the finished lesson. It opens only when the server's
 * own answer says the league moved up (isLeaguePromotion on the completion's previous and new league).
 */
export function LeaguePromotionTakeover({
  from,
  to,
  onContinue,
}: {
  from: LeagueTier;
  to: LeagueTier;
  onContinue: () => void;
}) {
  const titleId = useId();
  const reduceMotion = usePrefersReducedMotion();
  const copy = promotionCopy(from, to);
  const toIdx = LEAGUE_TIERS.indexOf(to);
  return (
    <Modal
      labelledBy={titleId}
      onEscape={onContinue}
      className="relative flex h-dvh w-full max-w-[430px] flex-col items-center overflow-hidden bg-[radial-gradient(90%_55%_at_50%_30%,var(--c-hero-a)_0%,var(--c-hero)_55%,var(--c-hero-b)_100%)] text-ds-on-hero outline-none sm:h-[min(100dvh,860px)] sm:rounded-[28px]"
    >
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-[250px] size-[760px] -translate-x-1/2 -translate-y-1/2 bg-[repeating-conic-gradient(from_0deg,color-mix(in_srgb,var(--c-on-hero-kick)_13%,transparent)_0deg_7deg,transparent_7deg_18deg)] [mask-image:radial-gradient(circle,black_18%,transparent_62%)]"
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] [mask-image:linear-gradient(to_bottom,black_0,black_72px,transparent_72px,transparent_128px,black_128px)]">
        <Confetti reduce={reduceMotion} seed={99} />
      </div>
      <p className="relative z-10 mt-[92px] ds-type-overline text-ds-on-hero-kick">
        League promotion
      </p>
      <div className="relative mt-[22px]">
        <Shield tier={to} width={190} height={210} />
      </div>
      <h2
        id={titleId}
        className="relative z-10 mt-[18px] px-4 text-center ds-type-display-x-l text-ds-on-hero"
      >
        {copy.headline}
      </h2>
      <p className="relative z-10 mt-1.5 px-2 text-center ds-type-body text-ds-on-hero-soft">
        {copy.line}
      </p>
      <ol aria-label="Leagues" className="relative z-10 mt-[22px] flex items-end gap-3.5">
        {LEAGUE_TIERS.map((tier, i) => (
          <li
            key={tier}
            aria-current={tier === to ? "true" : undefined}
            className={`grid justify-items-center gap-1 ds-type-caption font-bold ${
              tier === to ? "text-ds-on-hero" : "text-ds-on-hero-soft"
            }`}
          >
            <span
              className={tier === to ? "drop-shadow-[0_0_8px_var(--c-on-hero-kick)]" : undefined}
            >
              <Shield
                tier={tier}
                width={tier === to ? 38 : 30}
                height={tier === to ? 42 : 34}
                star={false}
                earned={i <= toIdx}
              />
            </span>
            {LEAGUE_TIER_META[tier].label}
          </li>
        ))}
      </ol>
      <img
        src="/alphonso/lesson/wow.webp"
        alt="Alphonso, amazed"
        decoding="async"
        draggable={false}
        className="pointer-events-none absolute bottom-[100px] left-1/2 w-[250px] -translate-x-1/2"
      />
      <div className="absolute inset-x-0 bottom-0 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onContinue}
          className={dsButtonClass("primary", { full: true })}
        >
          Continue
        </button>
      </div>
    </Modal>
  );
}
