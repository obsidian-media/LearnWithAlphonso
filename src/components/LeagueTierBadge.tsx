import { LEAGUE_TIER_META, type LeagueTier } from "../data/achievements";

export function LeagueTierBadge({
  tier,
  size = "md",
}: {
  tier: LeagueTier;
  size?: "sm" | "md" | "lg";
}) {
  const meta = LEAGUE_TIER_META[tier];
  const px = size === "sm" ? 24 : size === "lg" ? 44 : 32;
  return (
    <span
      className="inline-flex items-center justify-center rounded-full ring-1 ring-hairline"
      style={{ width: px, height: px, backgroundColor: `${meta.hex}18` }}
      aria-label={`${meta.label} league`}
    >
      <svg viewBox="0 0 24 24" width={px * 0.55} height={px * 0.55} fill="none">
        <path
          d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3z"
          fill={meta.hex}
          fillOpacity="0.85"
        />
        <path
          d="M9 12l2 2 4-4"
          stroke="white"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
