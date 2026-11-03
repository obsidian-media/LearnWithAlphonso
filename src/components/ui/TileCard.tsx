import { type TileTone, TILE_TONE_CLASSES } from "../../lib/tile-tones";
import { Icon3D } from "../Icon3D";

/**
 * A colour tile with a 3D icon, a title and an optional one-line description.
 * Presentational only: wrap it in a Link or button to make it tappable.
 */
export function TileCard({
  tone,
  icon,
  title,
  subtitle,
  badge,
  className = "",
}: {
  tone: TileTone;
  icon: string;
  title: string;
  subtitle?: string;
  /** A small label beside the icon, such as the CEFR level. */
  badge?: string;
  className?: string;
}) {
  return (
    <div
      data-tone={tone}
      className={`card-lift flex h-full min-h-28 flex-col gap-1.5 rounded-3xl p-3.5 ${TILE_TONE_CLASSES[tone]} ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <Icon3D emoji={icon} size={44} />
        {badge ? (
          <span className="rounded-full bg-white/55 px-2 py-0.5 text-[11px] font-semibold">
            {badge}
          </span>
        ) : null}
      </div>
      <h2 className="font-display text-[17px] font-bold leading-tight">{title}</h2>
      {subtitle ? <p className="text-[13px] leading-snug opacity-80">{subtitle}</p> : null}
    </div>
  );
}
