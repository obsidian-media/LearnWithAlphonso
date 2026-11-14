import { Medallion } from "../AchievementBadge";
import type { Achievement } from "../../data/achievements";
import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { DsIcon } from "../ds/DsIcon";
import { CountUp } from "../Celebration";
import { CONFETTI_SECONDS, confettiPieces, pieceAt, type ConfettiPiece } from "../../lib/confetti";
import type { LessonRewardChip } from "../../lib/lesson-rewards";

/**
 * The lesson-complete celebration, in code, in the unit's room: confetti in the robe's colours, reward tiles that
 * count up, and achievement toasts. Reduce Motion: a still scatter, final numbers, fades only.
 */

function drawPiece(
  ctx: CanvasRenderingContext2D,
  p: ConfettiPiece,
  x: number,
  y: number,
  a: number,
  fill: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = fill;
  if (p.star) {
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 3 : 7;
      const t = (k * Math.PI) / 5;
      ctx.lineTo(Math.cos(t) * r, Math.sin(t) * r);
    }
    ctx.closePath();
    ctx.fill();
  } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
  ctx.restore();
}

/** A canvas over the room. Falls once, then rests as a still scatter; under Reduce Motion only the scatter. */
export function Confetti({ reduce, seed = 7 }: { reduce: boolean; seed?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext?.("2d");
    if (!cv || !ctx) return;
    const width = cv.clientWidth || 393;
    const height = cv.clientHeight || 380;
    const dpr = window.devicePixelRatio || 1;
    cv.width = width * dpr;
    cv.height = height * dpr;
    ctx.scale(dpr, dpr);
    const css = getComputedStyle(cv);
    const pieces = confettiPieces(seed, width);
    const fill = (p: ConfettiPiece) => css.getPropertyValue(p.color).trim();
    const still = () => {
      ctx.clearRect(0, 0, width, height);
      for (const p of pieces) drawPiece(ctx, p, p.restX, p.restY, p.rot, fill(p));
    };
    if (reduce) {
      still();
      return;
    }
    let frame = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, width, height);
      for (const p of pieces) {
        const at = pieceAt(p, t);
        drawPiece(ctx, p, at.x, at.y, at.angle, fill(p));
      }
      if (t < CONFETTI_SECONDS) frame = requestAnimationFrame(step);
      else still();
    };
    // 150 ms after the room appears, per the spec's timeline.
    const timer = window.setTimeout(() => (frame = requestAnimationFrame(step)), 150);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [reduce, seed]);
  return (
    <canvas
      ref={ref}
      data-confetti={reduce ? "still" : "falling"}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[3] size-full"
    />
  );
}

const TILE = {
  xp: {
    title: "XP earned",
    label: "XP",
    icon: "bolt",
    solid: true,
    tone: "bg-ds-xp",
    tint: "bg-ds-xp-tint text-ds-xp",
  },
  streak: {
    title: "Day streak",
    label: "Streak",
    icon: "flame",
    solid: true,
    tone: "bg-ds-flame",
    tint: "bg-ds-flame-tint text-ds-flame",
  },
  accuracy: {
    title: "Accuracy",
    label: "Accuracy",
    icon: "target",
    solid: false,
    tone: "bg-ds-choice",
    tint: "bg-ds-choice-tint text-ds-choice",
  },
  time: {
    title: "Time",
    label: "Time",
    icon: "clock",
    solid: false,
    tone: "bg-ds-brand",
    tint: "bg-ds-sunk text-ds-brand",
  },
} as const;

/** The three reward tiles: a coloured top edge, an icon, a condensed number that counts up, and its name. */
export function RewardTiles({
  chips,
  time = null,
  reduce,
}: {
  chips: LessonRewardChip[];
  /** The lesson's time, "m:ss", as a fourth tile; null when it is not known. */
  time?: string | null;
  reduce: boolean;
}) {
  const tiles: { kind: keyof typeof TILE; value: string }[] = [
    ...chips,
    ...(time ? [{ kind: "time" as const, value: time }] : []),
  ];
  return (
    <div
      className={`grid gap-2.5 ${tiles.length === 4 ? "grid-cols-2" : "grid-cols-3"}`}
      data-reward-tiles=""
    >
      {tiles.map((c, i) => {
        const t = TILE[c.kind];
        return (
          <motion.div
            key={c.kind}
            role="group"
            aria-label={`${t.label}: ${c.value}`}
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38, delay: 0.6 + i * 0.12, ease: [0.2, 0.8, 0.2, 1] }}
            className="relative grid justify-items-center gap-0.5 overflow-hidden rounded-[18px] bg-ds-card px-2 py-3 text-center shadow-[var(--ds-shadow-resting)]"
          >
            <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${t.tone}`} />
            <span
              aria-hidden="true"
              className={`mb-0.5 grid size-[34px] place-items-center rounded-full ${t.tint}`}
            >
              {t.solid ? (
                <DsIcon name={t.icon as "bolt" | "flame"} solid className="size-5" />
              ) : (
                <DsIcon name={t.icon as "target" | "clock"} className="size-5" />
              )}
            </span>
            <span aria-hidden="true" className="ds-type-numeral-x-l text-ds-ink">
              <CountUp value={c.value} animate={!reduce} />
            </span>
            <span aria-hidden="true" className="ds-type-caption text-ds-ink-soft">
              {t.title}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

/** A new achievement: a gold medal on navy. Toasts slide in 250 ms apart after the tiles (fade under Reduce Motion). */
export function AchievementToast({
  achievement,
  index,
  reduce,
}: {
  achievement: Achievement;
  index: number;
  reduce: boolean;
}) {
  const { title, description } = achievement;
  return (
    <motion.div
      data-achievement-toast=""
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0.15 : 0.38, delay: reduce ? 0 : 1.7 + index * 0.25 }}
      className="relative grid grid-cols-[56px_minmax(0,1fr)] items-center gap-3 overflow-hidden rounded-[20px] bg-ds-hero py-3 pl-3 pr-3.5 text-left text-ds-on-hero shadow-[var(--ds-shadow-floating)]"
    >
      <span className="relative z-[1]">
        <Medallion achievement={achievement} state="earned" size={56} />
      </span>
      <div className="relative z-[1] min-w-0">
        <p className="ds-type-overline text-ds-on-hero-kick">Achievement unlocked</p>
        <p className="ds-type-headline font-extrabold">{title}</p>
        <p className="ds-type-footnote text-ds-on-hero-soft">{description}</p>
      </div>
    </motion.div>
  );
}
