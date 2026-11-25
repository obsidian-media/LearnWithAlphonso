import type { ReactNode } from "react";
import { streakAriaLabel } from "@/lib/streak-display";
import { Icon3D } from "../Icon3D";

export function StatPill({
  icon,
  value,
  color,
  label,
  hint,
}: {
  icon: ReactNode;
  value: number | string;
  color: string;
  label: string;
  /** A small second line, e.g. the time until the next heart. */
  hint?: string | null;
}) {
  return (
    <div
      className="flex items-center gap-1 rounded-full bg-ds-sunk py-0.5 pl-1.5 pr-2.5"
      aria-label={label}
    >
      <span className={color}>{icon}</span>
      <span className="tnum ds-type-footnote font-extrabold text-ds-ink">{value}</span>
      {hint ? <span className="tnum ds-type-caption text-ds-ink-soft">{hint}</span> : null}
    </div>
  );
}

import type { ShellStatsData } from "./use-shell-stats";

export function StatsAnnouncer({ text }: { text: string }) {
  return (
    <span className="sr-only" role="status" aria-live="polite">
      {text}
    </span>
  );
}

/** The streak, XP and hearts pills, in the order every surface uses. */
export function StatPills({ stats }: { stats: ShellStatsData }) {
  const { hydrated, shown, streak, xp, hearts, nextHeartIn } = stats;
  return (
    <>
      <StatPill
        icon={<Icon3D emoji="🔥" size={20} />}
        value={hydrated ? streak : 0}
        color="text-ds-flame"
        label={hydrated ? streakAriaLabel(shown) : "Streak"}
        hint={hydrated && shown.state === "protected" ? "❄️" : null}
      />
      <StatPill
        icon={<Icon3D emoji="⚡" size={20} />}
        value={hydrated ? xp : 0}
        color="text-ds-xp-text"
        label="XP"
      />
      <StatPill
        icon={<Icon3D emoji="❤️" size={20} />}
        value={hydrated ? hearts : 5}
        color="text-ds-heart"
        label="Hearts"
        hint={nextHeartIn ? `+1 in ${nextHeartIn}` : null}
      />
    </>
  );
}
