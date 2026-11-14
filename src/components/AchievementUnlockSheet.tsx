import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ACHIEVEMENTS_BY_ID } from "../data/achievements";
import { tierLabel, unlockLine, unlockPose } from "../lib/badge-state";
import { Medallion } from "./AchievementBadge";
import { DsPill } from "./ds/Blocks";
import { dsButtonClass } from "./ds/buttons";
import { Modal } from "./Modal";

/**
 * The moment a badge is earned (round 12, 14b): a sheet over the finished lesson with Alphonso beside the new
 * medallion on a gold glow, its name, what it asks for, its tier, and Continue. With several new badges it shows
 * them one after the other. "See all achievements" opens the Profile, where they live.
 */
export function AchievementUnlockSheet({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const known = ids.map((id) => ACHIEVEMENTS_BY_ID[id]).filter((a) => a !== undefined);
  const [index, setIndex] = useState(0);
  const a = known[index];
  if (!a) return null;
  const last = index >= known.length - 1;
  const line = unlockLine(a);
  const next = () => (last ? onDone() : setIndex(index + 1));
  return (
    <Modal
      labelledBy="achievement-unlock-title"
      onEscape={next}
      className="relative grid max-h-[92dvh] w-full max-w-[430px] justify-items-center gap-2.5 overflow-y-auto rounded-t-[28px] bg-ds-surface px-5 pb-6 pt-4 text-center shadow-[var(--ds-shadow-sheet)] outline-none sm:rounded-[28px]"
    >
      <div className="mt-2 flex items-end justify-center gap-1">
        <img
          src={`/figures/alphonso-${unlockPose(a)}.webp`}
          alt=""
          height={180}
          decoding="async"
          draggable={false}
          className="-mb-1.5 h-[180px] w-auto"
        />
        <span className="relative mb-4 ml-3 inline-grid place-items-center">
          <span
            aria-hidden="true"
            className="absolute -inset-7 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--c-on-hero-kick)_70%,transparent),transparent_66%)]"
          />
          <span className="relative">
            <Medallion achievement={a} state="earned" size={176} />
          </span>
        </span>
      </div>
      <p className="ds-type-overline text-ds-xp-text">Achievement unlocked</p>
      <h2 id="achievement-unlock-title" className="ds-type-display text-ds-ink">
        {a.title}
      </h2>
      <p className="ds-type-body text-ds-ink-soft">{a.description}</p>
      <DsPill tone="xp">{tierLabel(a)}</DsPill>
      {line && <p className="ds-type-footnote max-w-[290px] text-ds-ink-soft">{line}</p>}
      <div className="mt-2 grid w-full gap-1">
        <button type="button" onClick={next} className={dsButtonClass("primary", { full: true })}>
          Continue
        </button>
        <Link
          to="/profile"
          onClick={onDone}
          className="inline-flex min-h-11 items-center justify-center ds-type-footnote font-extrabold text-ds-choice"
        >
          See all achievements
        </Link>
      </div>
    </Modal>
  );
}
