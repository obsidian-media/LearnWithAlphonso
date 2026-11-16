import { useId } from "react";
import type { LeagueTier } from "../data/achievements";
import { recapIsQuiet, recapPromotionLine } from "../lib/league-engagement";
import { DsButton, DsCard, DsHero, Icon } from "./ds/Blocks";
import { Modal } from "./Modal";

export type RecapView =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      lastWeekXp: number;
      currentRank: number | null;
      /** The league the learner moved up to since the last recap; null when there was no promotion. */
      promotedTo: LeagueTier | null;
    };

/**
 * The weekly recap sheet (round 12, screen 25), the web twin of WeeklyRecapView on iOS and the recap dialog on
 * Android: Alphonso cheering (asleep after a quiet week), last week's XP in display numerals, today's global weekly
 * rank with its honest "approximate" note, and the promotion when there was one. A block only appears when its data
 * exists, so a quiet week shows the first block alone.
 */
export function WeeklyRecapSheet({ view, onDone }: { view: RecapView; onDone: () => void }) {
  const titleId = useId();
  const quiet = view.status === "ready" ? recapIsQuiet(view.lastWeekXp) : true;
  return (
    <Modal
      labelledBy={titleId}
      onEscape={onDone}
      className="relative grid max-h-[92dvh] w-full max-w-[430px] gap-3 overflow-y-auto rounded-t-[28px] bg-ds-surface px-4 pb-6 pt-4 shadow-[var(--ds-shadow-sheet)] outline-none sm:rounded-[28px]"
    >
      <div className="flex items-center gap-2.5">
        <h2 id={titleId} className="ds-type-headline min-w-0 flex-1 text-ds-ink">
          Weekly recap
        </h2>
        <DsButton small variant="secondary" onClick={onDone}>
          Done
        </DsButton>
      </div>

      {view.status === "loading" && (
        <p role="status" className="py-10 text-center ds-type-footnote text-ds-ink-soft">
          Loading…
        </p>
      )}

      {view.status === "error" && (
        <p role="alert" className="py-8 text-center ds-type-footnote font-bold text-ds-wrong-ink">
          Couldn't load your recap. Check your connection and try again.
        </p>
      )}

      {view.status === "ready" && (
        <div className="grid justify-items-center gap-3 text-center">
          <img
            src={`/mascots/alphonso-${quiet ? "sleepy-night" : "levelup-cheer"}.webp`}
            alt=""
            height={170}
            decoding="async"
            draggable={false}
            className="h-[170px] w-auto"
          />
          <p className="ds-type-body text-ds-ink-soft">Last week you earned</p>
          <p className="tnum ds-type-display-x-l text-ds-ink">
            {view.lastWeekXp.toLocaleString()} XP
          </p>

          {view.currentRank !== null && (
            <DsCard className="w-full justify-items-center gap-1">
              <p className="ds-type-caption text-ds-ink-soft">Your rank today (global, weekly)</p>
              <p className="tnum ds-type-title text-ds-ink">#{view.currentRank}</p>
              <p className="ds-type-caption text-ds-ink-soft">
                Approximate: this app doesn't keep a snapshot of last week's exact standings.
              </p>
            </DsCard>
          )}

          {view.promotedTo && (
            <DsHero className="w-full">
              <div className="flex items-center justify-center gap-2.5">
                <Icon name="shield" size={36} />
                <p className="ds-type-headline">{recapPromotionLine(view.promotedTo)}</p>
              </div>
            </DsHero>
          )}
        </div>
      )}
    </Modal>
  );
}
