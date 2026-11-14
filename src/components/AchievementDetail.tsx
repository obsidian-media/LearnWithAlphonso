import { ACHIEVEMENTS, type Achievement } from "../data/achievements";
import {
  badgeRing,
  badgeState,
  ladderTitle,
  progressLine,
  tierLabel,
  unlockedDate,
} from "../lib/badge-state";
import { Medallion } from "./AchievementBadge";
import { DsBar, DsButton, DsCard, DsPill } from "./ds/Blocks";
import { Modal } from "./Modal";

/**
 * A badge's detail sheet: the large medallion, its tier, where the learner stands (progress, or the unlock date) and
 * the family ladder. `values` are what the client can count per achievement id; `unlocked` maps id to the unlock time.
 */
export function AchievementDetail({
  achievement,
  unlocked,
  value,
  onClose,
}: {
  achievement: Achievement;
  /** Unlock times by achievement id (null when earned with no date). */
  unlocked: Map<string, string | null>;
  value: (a: Achievement) => number | null;
  onClose: () => void;
}) {
  const have = unlocked.has(achievement.id);
  const v = value(achievement);
  const state = badgeState({ unlocked: have, value: v, threshold: achievement.threshold });
  const ring = badgeRing({ value: v, threshold: achievement.threshold });
  const ladder = ACHIEVEMENTS.filter((a) => a.category === achievement.category).sort(
    (a, b) => a.threshold - b.threshold,
  );
  const date = unlockedDate(unlocked.get(achievement.id));
  return (
    <Modal
      labelledBy="achievement-detail-title"
      onEscape={onClose}
      className="relative grid max-h-[92dvh] w-full max-w-[430px] gap-3 overflow-y-auto rounded-t-[28px] bg-ds-surface px-4 pb-6 pt-3 shadow-[var(--ds-shadow-sheet)] outline-none sm:rounded-[28px]"
    >
      <div className="flex min-h-11 justify-end">
        <DsButton small variant="secondary" onClick={onClose}>
          Done
        </DsButton>
      </div>
      <div className="grid justify-items-center gap-2 text-center">
        <Medallion achievement={achievement} state={state} ring={ring} size={170} />
        <h2 id="achievement-detail-title" className="ds-type-display text-ds-ink">
          {achievement.title}
        </h2>
        <DsPill tone="xp">{tierLabel(achievement)}</DsPill>
      </div>
      {state === "progress" && v !== null ? (
        <DsCard>
          <div className="flex items-center gap-2">
            <p className="ds-type-headline min-w-0 flex-1 text-ds-ink">
              {progressLine(v, achievement.threshold)}
            </p>
            <DsPill tone="xp">{Math.round(ring * 100)}%</DsPill>
          </div>
          <DsBar value={ring} label={`${achievement.title}: ${achievement.description}`} tall />
          <p className="ds-type-footnote text-ds-ink-soft">{achievement.description}</p>
        </DsCard>
      ) : state === "earned" ? (
        <DsCard>
          <p className="ds-type-headline text-ds-ink">Unlocked</p>
          {date && <p className="ds-type-footnote text-ds-ink-soft">{date}</p>}
          <p className="ds-type-footnote text-ds-ink-soft">{achievement.description}</p>
        </DsCard>
      ) : (
        <DsCard>
          <p className="ds-type-footnote text-ds-ink-soft">{achievement.description}</p>
        </DsCard>
      )}
      <DsCard>
        <p className="ds-type-overline text-ds-xp-text">{ladderTitle(achievement.category)}</p>
        <ul className="flex items-end justify-between gap-1">
          {ladder.map((a) => {
            const rung = badgeState({
              unlocked: unlocked.has(a.id),
              value: value(a),
              threshold: a.threshold,
            });
            return (
              <li key={a.id} className="grid justify-items-center gap-1">
                <Medallion
                  achievement={a}
                  state={rung}
                  ring={badgeRing({ value: value(a), threshold: a.threshold })}
                  size={a.id === achievement.id ? 62 : 50}
                />
                <span
                  className={`tnum ds-type-caption ${a.id === achievement.id ? "text-ds-xp-text" : "text-ds-ink-soft"}`}
                >
                  {a.threshold.toLocaleString("en-US")}
                </span>
              </li>
            );
          })}
        </ul>
      </DsCard>
    </Modal>
  );
}
