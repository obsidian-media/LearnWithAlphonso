import { useEffect, useRef, useState } from "react";
import { useShownStreak } from "@/lib/use-shown-streak";
import { useCountdown } from "../../hooks/use-countdown";
import { MAX_HEARTS } from "../../lib/hearts";
import { useProgress } from "../../lib/progress";

/**
 * The learner's streak, XP and hearts as the shell shows them: the phone's top bar, the tablet strip and the desktop
 * panel all read this one hook, so they can never disagree. Mount it in exactly one place at a time: it also keeps the
 * heart timer and announces genuine changes to screen readers.
 */
export function useShellStats() {
  const { xp, hearts, heartsRefillAt, hydrated, leagueTier, streakFreezes } = useProgress();
  // The streak as it reads today: 0 once the next lesson would restart it, marked while a freeze keeps it alive.
  const shown = useShownStreak();
  const streak = shown.streak;
  const refillHeartsLocal = useProgress((s) => s.refillHeartsLocal);

  // Below the cap a heart comes back every 30 minutes. Show the wait for the next one (the same clock the server
  // keeps) and add the heart on screen the moment it is due.
  const nextHeartIn = useCountdown(hydrated && hearts < MAX_HEARTS ? heartsRefillAt : null);
  useEffect(() => {
    if (!hydrated || heartsRefillAt === null || hearts >= MAX_HEARTS) return;
    const id = setTimeout(refillHeartsLocal, Math.max(0, heartsRefillAt - Date.now()) + 50);
    return () => clearTimeout(id);
  }, [hydrated, hearts, heartsRefillAt, refillHeartsLocal]);

  // Announce meaningful stat changes to screen readers -- but never on
  // first hydration (every page load), only on genuine later changes.
  const [announcement, setAnnouncement] = useState("");
  const prevStats = useRef<{ xp: number; streak: number; hearts: number } | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    const prev = prevStats.current;
    if (prev === null) {
      prevStats.current = { xp, streak, hearts };
      return;
    }
    const changes: string[] = [];
    if (hearts !== prev.hearts) {
      const diff = hearts - prev.hearts;
      changes.push(diff > 0 ? `+${diff} heart${diff === 1 ? "" : "s"}` : `Hearts: ${hearts}`);
    }
    if (xp > prev.xp) changes.push(`+${xp - prev.xp} XP`);
    if (streak !== prev.streak) changes.push(`Streak: ${streak}`);
    if (changes.length) setAnnouncement(changes.join(", "));
    prevStats.current = { xp, streak, hearts };
  }, [hydrated, xp, streak, hearts]);

  return {
    xp,
    hearts,
    hydrated,
    leagueTier,
    streakFreezes,
    shown,
    streak,
    nextHeartIn,
    announcement,
  };
}

export type ShellStatsData = ReturnType<typeof useShellStats>;
