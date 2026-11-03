import type { TileTone } from "../../lib/tile-tones";
import { Icon3D } from "../Icon3D";

const TONE_CLASSES: Record<TileTone, string> = {
  coral: "bg-tile-coral-bg text-tile-coral-ink",
  sky: "bg-tile-sky-bg text-tile-sky-ink",
  sun: "bg-tile-sun-bg text-tile-sun-ink",
  lilac: "bg-tile-lilac-bg text-tile-lilac-ink",
  mint: "bg-tile-mint-bg text-tile-mint-ink",
};

/**
 * A colour tile with a 3D icon, a title and an optional one-line description.
 * Presentational only: wrap it in a Link or button to make it tappable.
 */
export function TileCard({
  tone,
  icon,
  title,
  subtitle,
  className = "",
}: {
  tone: TileTone;
  icon: string;
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div
      data-tone={tone}
      className={`card-lift flex h-full min-h-28 flex-col gap-1.5 rounded-3xl p-3.5 ${TONE_CLASSES[tone]} ${className}`}
    >
      <Icon3D emoji={icon} size={44} />
      <p className="font-display text-[17px] font-bold leading-tight">{title}</p>
      {subtitle ? <p className="text-[13px] leading-snug opacity-80">{subtitle}</p> : null}
    </div>
  );
}
