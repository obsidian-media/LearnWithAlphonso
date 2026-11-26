import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Course } from "@/data/courses";
import { QUESTS_BY_ID, claimQuestMessage } from "@/data/quests";
import { claimWeeklyQuest } from "@/lib/quests.functions";
import { useProgress } from "@/lib/progress";
import { useWeeklyQuests } from "@/lib/use-weekly-quests";

/** Same look as WeeklyChallengesCard; a quest at its target shows a Claim button that pays its XP once. */
export function WeeklyQuestsCard({ course, nested = false }: { course: Course; nested?: boolean }) {
  const { quests, isLoading, failed, retry } = useWeeklyQuests(course, { nested });
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function claim(questId: string) {
    if (busy) return;
    setBusy(questId);
    setNotice(null);
    try {
      const res = await claimWeeklyQuest({ data: { questId, course } });
      if (res.ok) {
        // totalXp is this course's XP after the claim, so it replaces the local figure when it is the course on screen.
        if (useProgress.getState().course === course) useProgress.setState({ xp: res.totalXp });
        setNotice(`+${res.xp} XP claimed!`);
      } else {
        setNotice(claimQuestMessage(res.reason));
      }
    } catch {
      setNotice("Couldn't claim that reward. Try again.");
    } finally {
      setBusy(null);
      await queryClient.invalidateQueries({ queryKey: ["weeklyQuests", course] });
    }
  }

  if (failed)
    return (
      <div role="alert" className="card-lift rounded-3xl bg-tile-sky-bg p-4">
        <p className="font-display text-sm font-semibold text-ds-ink">This week's quests</p>
        <p className="mt-2 text-xs text-ds-ink-soft">Couldn't load this week's quests.</p>
        <button
          type="button"
          onClick={retry}
          className="mt-2 min-h-11 rounded-full px-3 text-xs font-semibold text-ds-ink underline"
        >
          Try again
        </button>
      </div>
    );
  if (isLoading || !quests || quests.length === 0) return null;

  return (
    <div className="card-lift rounded-3xl bg-tile-sky-bg p-4">
      <p className="font-display text-sm font-semibold text-ds-ink">This week's quests</p>
      <div className="mt-3 space-y-3">
        {quests.map((q) => {
          const def = QUESTS_BY_ID[q.questId];
          if (!def) return null;
          const done = q.progress >= q.target;
          return (
            <div key={q.questId}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className={q.claimed ? "text-ds-brand line-through" : "text-ds-ink"}>
                  {def.title}
                  <span className="ml-1 text-ds-ink-soft">+{def.xpReward} XP</span>
                </span>
                <span className="tnum text-ds-ink-soft">
                  {Math.min(q.progress, q.target)}/{q.target}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ds-line">
                <div
                  className="h-full rounded-full bg-ds-brand"
                  style={{ width: `${Math.min(100, (q.progress / q.target) * 100)}%` }}
                />
              </div>
              {done && !q.claimed ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void claim(q.questId)}
                  aria-label={`Claim ${def.title}, +${def.xpReward} XP`}
                  className="mt-2 min-h-11 rounded-full bg-ds-brand px-4 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {busy === q.questId ? "Claiming..." : "Claim"}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {notice ? (
        <p role="status" className="mt-3 text-xs font-semibold text-ds-ink">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
