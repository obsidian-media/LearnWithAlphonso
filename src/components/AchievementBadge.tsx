import type { Achievement } from "../data/achievements";
import { useTheme } from "../lib/theme";

const TIER_COLORS: Record<string, string> = {
  bronze: "#b07242",
  silver: "#8a9099",
  gold: "#c4933f",
  diamond: "#4a7f7a",
};

function GlyphSvg({ icon }: { icon: string }) {
  switch (icon) {
    case "flame":
      return (
        <path
          d="M12 3c1.5 3 5 4.5 5 8.5A5 5 0 0 1 7 12c0-2 1-3 2-4-.4 2 .8 3 1.5 3-.3-3 1-6 1.5-8z"
          fill="white"
        />
      );
    case "bolt":
      return <path d="M13 3 5 14h5l-1 7 9-12h-5l1-6z" fill="white" />;
    case "star":
      return (
        <path
          d="m12 3 2.5 5.7 6.2.6-4.7 4.2 1.4 6.1L12 16.7 6.6 19.6l1.4-6.1L3.3 9.3l6.2-.6L12 3z"
          fill="white"
        />
      );
    case "check":
      return (
        <path
          d="m6 12 4 4 8-9"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      );
    case "shield":
      return <path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3z" fill="white" />;
    case "snow":
      return (
        <g stroke="white" strokeWidth="1.8" strokeLinecap="round">
          <path d="M12 3v18M4 8l16 8M4 16l16-8" />
        </g>
      );
    default:
      return <circle cx="12" cy="12" r="4" fill="white" />;
  }
}

export function AchievementBadge({
  achievement,
  unlocked,
}: {
  achievement: Achievement;
  unlocked: boolean;
}) {
  const isStudioInk = useTheme((s) => s.theme === "studio-ink");
  const color = TIER_COLORS[achievement.tier] ?? "#888";
  const badgeIcon = (
    <span
      className="grid size-12 place-items-center rounded-full"
      style={{ backgroundColor: unlocked ? color : "#c8c1b3" }}
    >
      <svg viewBox="0 0 24 24" className="size-6">
        <GlyphSvg icon={achievement.icon} />
      </svg>
    </span>
  );
  if (isStudioInk) {
    return (
      <div
        className={`flex flex-col items-center gap-1.5 text-center transition ${unlocked ? "" : "opacity-55"}`}
      >
        {badgeIcon}
        <p className="text-[11px] font-semibold leading-tight text-ink">{achievement.title}</p>
        <p className="text-[10px] leading-tight text-ink-soft/70">{achievement.description}</p>
      </div>
    );
  }
  return (
    <div
      className={`flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-center transition ${
        unlocked ? "border-hairline bg-surface" : "border-hairline bg-parchment opacity-55"
      }`}
    >
      {badgeIcon}
      <p className="text-[11px] font-semibold leading-tight text-ink">{achievement.title}</p>
      <p className="text-[10px] leading-tight text-ink-soft/70">{achievement.description}</p>
    </div>
  );
}
